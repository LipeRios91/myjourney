using System.IO;
using System.Threading;
using NAudio.CoreAudioApi;
using NAudio.Wave;
using NAudio.Wave.SampleProviders;

namespace MicRecorder.Audio;

public sealed class RecorderSettings
{
    /// <summary>RMS (0..1) acima do qual mic ou sistema são considerados "em atividade".</summary>
    public double SilenceThreshold { get; init; } = 0.02;

    /// <summary>Silêncio contínuo (nas duas fontes) necessário para fechar a sessão atual.</summary>
    public TimeSpan SilenceGap { get; init; } = TimeSpan.FromSeconds(2);

    /// <summary>Áudio mantido em buffer antes do início da atividade, para não cortar o começo.</summary>
    public TimeSpan PreRoll { get; init; } = TimeSpan.FromMilliseconds(500);

    public required string OutputFolder { get; init; }

    public int MixSampleRate { get; init; } = 48000;
}

/// <summary>
/// Grava simultaneamente o microfone (o que o usuário fala) e a saída de áudio do
/// sistema (o que o usuário ouve) num único arquivo estéreo — canal esquerdo = mic,
/// canal direito = sistema — dividindo automaticamente em sessões separadas quando as
/// duas fontes ficam em silêncio por tempo suficiente.
/// </summary>
public sealed class DualSourceRecorder : IDisposable
{
    private readonly RecorderSettings _settings;
    private readonly object _sync = new();

    private WasapiCapture? _micCapture;
    private WasapiLoopbackCapture? _systemCapture;
    private BufferedWaveProvider? _micRawBuffer;
    private BufferedWaveProvider? _systemRawBuffer;
    private ISampleProvider? _micSampleProvider;
    private ISampleProvider? _systemSampleProvider;

    private WaveFileWriter? _writer;
    private string? _currentSegmentPath;
    private Thread? _mixerThread;
    private volatile bool _running;
    private int _stoppedSourceCount;
    private DateTime _lastActivityUtc;
    private readonly List<float[]> _preRollChunks = new();
    private int _preRollFramesTarget;

    public event EventHandler<float>? MicLevelChanged;
    public event EventHandler<float>? SystemLevelChanged;
    public event EventHandler<string>? SegmentStarted;
    public event EventHandler<string>? SegmentFinished;
    public event EventHandler<Exception>? ErrorOccurred;
    public event EventHandler? Stopped;

    public bool IsRecording { get; private set; }

    public DualSourceRecorder(RecorderSettings settings)
    {
        _settings = settings;
        Directory.CreateDirectory(_settings.OutputFolder);
    }

    public void Start(MMDevice micDevice, MMDevice? systemRenderDevice)
    {
        if (IsRecording) return;

        _micCapture = new WasapiCapture(micDevice, false, 100);
        _systemCapture = systemRenderDevice is not null
            ? new WasapiLoopbackCapture(systemRenderDevice)
            : new WasapiLoopbackCapture();

        _micRawBuffer = CreateRawBuffer(_micCapture.WaveFormat);
        _systemRawBuffer = CreateRawBuffer(_systemCapture.WaveFormat);

        _micSampleProvider = BuildMonoResampledChain(_micRawBuffer);
        _systemSampleProvider = BuildMonoResampledChain(_systemRawBuffer);

        _micCapture.DataAvailable += OnMicDataAvailable;
        _systemCapture.DataAvailable += OnSystemDataAvailable;
        _micCapture.RecordingStopped += OnAnySourceStopped;
        _systemCapture.RecordingStopped += OnAnySourceStopped;

        _preRollFramesTarget = (int)(_settings.PreRoll.TotalSeconds * _settings.MixSampleRate);
        _preRollChunks.Clear();
        _lastActivityUtc = DateTime.UtcNow;
        _stoppedSourceCount = 0;
        _running = true;

        _micCapture.StartRecording();
        _systemCapture.StartRecording();

        _mixerThread = new Thread(MixerLoop) { IsBackground = true, Name = "MicRecorder-Mixer" };
        _mixerThread.Start();

        IsRecording = true;
    }

    public void Stop()
    {
        if (!IsRecording) return;
        _micCapture?.StopRecording();
        _systemCapture?.StopRecording();
    }

    private static BufferedWaveProvider CreateRawBuffer(WaveFormat format) => new(format)
    {
        BufferDuration = TimeSpan.FromSeconds(5),
        DiscardOnBufferOverflow = true,
        ReadFully = true
    };

    private ISampleProvider BuildMonoResampledChain(BufferedWaveProvider rawBuffer)
    {
        ISampleProvider sampleProvider = rawBuffer.ToSampleProvider();

        if (sampleProvider.WaveFormat.Channels > 1)
        {
            sampleProvider = new MonoMixSampleProvider(sampleProvider);
        }

        if (sampleProvider.WaveFormat.SampleRate != _settings.MixSampleRate)
        {
            sampleProvider = new WdlResamplingSampleProvider(sampleProvider, _settings.MixSampleRate);
        }

        return sampleProvider;
    }

    private void OnMicDataAvailable(object? sender, WaveInEventArgs e)
    {
        _micRawBuffer!.AddSamples(e.Buffer, 0, e.BytesRecorded);
        MicLevelChanged?.Invoke(this, Math.Min(1f, AudioLevel.ComputeRms(e.Buffer, e.BytesRecorded, _micCapture!.WaveFormat) * 6f));
    }

    private void OnSystemDataAvailable(object? sender, WaveInEventArgs e)
    {
        _systemRawBuffer!.AddSamples(e.Buffer, 0, e.BytesRecorded);
        SystemLevelChanged?.Invoke(this, Math.Min(1f, AudioLevel.ComputeRms(e.Buffer, e.BytesRecorded, _systemCapture!.WaveFormat) * 6f));
    }

    private void MixerLoop()
    {
        const int tickMs = 20;
        int frameCount = _settings.MixSampleRate * tickMs / 1000;
        var micFrames = new float[frameCount];
        var sysFrames = new float[frameCount];
        var interleaved = new float[frameCount * 2];

        while (_running)
        {
            Thread.Sleep(tickMs);

            try
            {
                _micSampleProvider!.Read(micFrames, 0, frameCount);
                _systemSampleProvider!.Read(sysFrames, 0, frameCount);
            }
            catch (Exception ex)
            {
                ErrorOccurred?.Invoke(this, ex);
                continue;
            }

            bool isActive = AudioLevel.ComputeRms(micFrames, frameCount) >= _settings.SilenceThreshold
                            || AudioLevel.ComputeRms(sysFrames, frameCount) >= _settings.SilenceThreshold;

            for (int i = 0; i < frameCount; i++)
            {
                interleaved[i * 2] = micFrames[i];
                interleaved[i * 2 + 1] = sysFrames[i];
            }

            lock (_sync)
            {
                if (isActive)
                {
                    _lastActivityUtc = DateTime.UtcNow;

                    if (_writer is null)
                    {
                        StartSegment();
                    }

                    WriteSafely(interleaved, frameCount * 2);
                }
                else if (_writer is not null)
                {
                    if (DateTime.UtcNow - _lastActivityUtc < _settings.SilenceGap)
                    {
                        WriteSafely(interleaved, frameCount * 2);
                    }
                    else
                    {
                        FinishSegment();
                    }
                }
                else
                {
                    BufferPreRoll(interleaved, frameCount);
                }
            }
        }
    }

    private void StartSegment()
    {
        var fileName = $"sessao_{DateTime.Now:yyyy-MM-dd_HH-mm-ss}.wav";
        _currentSegmentPath = Path.Combine(_settings.OutputFolder, fileName);
        var waveFormat = WaveFormat.CreateIeeeFloatWaveFormat(_settings.MixSampleRate, 2);
        _writer = new WaveFileWriter(_currentSegmentPath, waveFormat);

        foreach (var chunk in _preRollChunks)
        {
            _writer.WriteSamples(chunk, 0, chunk.Length);
        }
        _preRollChunks.Clear();

        SegmentStarted?.Invoke(this, _currentSegmentPath);
    }

    private void FinishSegment()
    {
        if (_writer is null) return;

        var path = _currentSegmentPath!;
        _writer.Dispose();
        _writer = null;
        _currentSegmentPath = null;

        SegmentFinished?.Invoke(this, path);
    }

    private void WriteSafely(float[] interleaved, int count)
    {
        try
        {
            _writer!.WriteSamples(interleaved, 0, count);
        }
        catch (Exception ex)
        {
            ErrorOccurred?.Invoke(this, ex);
        }
    }

    private void BufferPreRoll(float[] interleaved, int frameCount)
    {
        if (_preRollFramesTarget <= 0) return;

        var copy = new float[frameCount * 2];
        Array.Copy(interleaved, copy, copy.Length);
        _preRollChunks.Add(copy);

        int totalFrames = _preRollChunks.Sum(c => c.Length / 2);
        while (totalFrames > _preRollFramesTarget && _preRollChunks.Count > 0)
        {
            totalFrames -= _preRollChunks[0].Length / 2;
            _preRollChunks.RemoveAt(0);
        }
    }

    private void OnAnySourceStopped(object? sender, StoppedEventArgs e)
    {
        if (e.Exception is not null)
        {
            ErrorOccurred?.Invoke(this, e.Exception);
        }

        // se uma fonte parar (ex: erro) sem que a outra tenha sido parada ainda, força a outra a parar também
        if (ReferenceEquals(sender, _micCapture))
        {
            _systemCapture?.StopRecording();
        }
        else if (ReferenceEquals(sender, _systemCapture))
        {
            _micCapture?.StopRecording();
        }

        if (Interlocked.Increment(ref _stoppedSourceCount) < 2) return;

        _running = false;
        _mixerThread?.Join(500);

        lock (_sync)
        {
            FinishSegment();
        }

        IsRecording = false;

        _micCapture?.Dispose();
        _micCapture = null;
        _systemCapture?.Dispose();
        _systemCapture = null;

        Stopped?.Invoke(this, EventArgs.Empty);
    }

    public void Dispose()
    {
        Stop();
        _mixerThread?.Join(500);
        _writer?.Dispose();
        _micCapture?.Dispose();
        _systemCapture?.Dispose();
    }
}
