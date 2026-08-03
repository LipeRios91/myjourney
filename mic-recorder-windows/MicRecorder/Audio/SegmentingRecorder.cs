using NAudio.CoreAudioApi;
using NAudio.Wave;

namespace MicRecorder.Audio;

public sealed class RecorderSettings
{
    /// <summary>RMS (0..1) acima do qual o áudio é considerado "fala".</summary>
    public double SilenceThreshold { get; init; } = 0.02;

    /// <summary>Duração de silêncio contínuo necessária para fechar o segmento atual.</summary>
    public TimeSpan SilenceGap { get; init; } = TimeSpan.FromSeconds(1.5);

    /// <summary>Áudio mantido em buffer antes do início da fala, para não cortar a primeira sílaba.</summary>
    public TimeSpan PreRoll { get; init; } = TimeSpan.FromMilliseconds(400);

    public required string OutputFolder { get; init; }
}

public sealed class SegmentingRecorder : IDisposable
{
    private readonly RecorderSettings _settings;
    private readonly object _sync = new();

    private WasapiCapture? _capture;
    private WaveFileWriter? _writer;
    private string? _currentSegmentPath;
    private DateTime _lastVoiceUtc;
    private readonly List<byte[]> _preRollChunks = new();
    private int _preRollBytesTarget;
    private int _preRollBytesHeld;

    public event EventHandler<float>? LevelChanged;
    public event EventHandler<string>? SegmentStarted;
    public event EventHandler<string>? SegmentFinished;
    public event EventHandler<Exception>? ErrorOccurred;
    public event EventHandler? Stopped;

    public bool IsRecording { get; private set; }

    public SegmentingRecorder(RecorderSettings settings)
    {
        _settings = settings;
        Directory.CreateDirectory(_settings.OutputFolder);
    }

    public void Start(MMDevice device)
    {
        if (IsRecording) return;

        _capture = new WasapiCapture(device, false, 100);
        _preRollBytesTarget = (int)(_capture.WaveFormat.AverageBytesPerSecond * _settings.PreRoll.TotalSeconds);
        _preRollChunks.Clear();
        _preRollBytesHeld = 0;
        _lastVoiceUtc = DateTime.UtcNow;

        _capture.DataAvailable += OnDataAvailable;
        _capture.RecordingStopped += OnRecordingStopped;
        _capture.StartRecording();
        IsRecording = true;
    }

    public void Stop()
    {
        if (!IsRecording) return;
        _capture?.StopRecording();
    }

    private void OnDataAvailable(object? sender, WaveInEventArgs e)
    {
        if (_capture is null) return;

        var format = _capture.WaveFormat;
        float rms = ComputeRms(e.Buffer, e.BytesRecorded, format);
        LevelChanged?.Invoke(this, Math.Min(1f, rms * 6f));

        bool isVoice = rms >= _settings.SilenceThreshold;

        lock (_sync)
        {
            if (isVoice)
            {
                _lastVoiceUtc = DateTime.UtcNow;

                if (_writer is null)
                {
                    StartSegment(format);
                }

                WriteSafely(e.Buffer, e.BytesRecorded);
            }
            else if (_writer is not null)
            {
                var silenceElapsed = DateTime.UtcNow - _lastVoiceUtc;
                if (silenceElapsed < _settings.SilenceGap)
                {
                    // pausa curta dentro da mesma frase/sessão: mantém no mesmo arquivo
                    WriteSafely(e.Buffer, e.BytesRecorded);
                }
                else
                {
                    FinishSegment();
                }
            }
            else
            {
                BufferPreRoll(e.Buffer, e.BytesRecorded);
            }
        }
    }

    private void StartSegment(WaveFormat format)
    {
        var fileName = $"gravacao_{DateTime.Now:yyyy-MM-dd_HH-mm-ss}.wav";
        _currentSegmentPath = Path.Combine(_settings.OutputFolder, fileName);
        _writer = new WaveFileWriter(_currentSegmentPath, format);

        foreach (var chunk in _preRollChunks)
        {
            _writer.Write(chunk, 0, chunk.Length);
        }
        _preRollChunks.Clear();
        _preRollBytesHeld = 0;

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

    private void WriteSafely(byte[] buffer, int count)
    {
        try
        {
            _writer!.Write(buffer, 0, count);
        }
        catch (Exception ex)
        {
            ErrorOccurred?.Invoke(this, ex);
        }
    }

    private void BufferPreRoll(byte[] buffer, int count)
    {
        if (_preRollBytesTarget <= 0) return;

        var chunk = new byte[count];
        Buffer.BlockCopy(buffer, 0, chunk, 0, count);
        _preRollChunks.Add(chunk);
        _preRollBytesHeld += count;

        while (_preRollBytesHeld > _preRollBytesTarget && _preRollChunks.Count > 0)
        {
            _preRollBytesHeld -= _preRollChunks[0].Length;
            _preRollChunks.RemoveAt(0);
        }
    }

    private void OnRecordingStopped(object? sender, StoppedEventArgs e)
    {
        lock (_sync)
        {
            FinishSegment();
        }

        IsRecording = false;

        if (e.Exception is not null)
        {
            ErrorOccurred?.Invoke(this, e.Exception);
        }

        Stopped?.Invoke(this, EventArgs.Empty);

        _capture?.Dispose();
        _capture = null;
    }

    private static float ComputeRms(byte[] buffer, int bytesRecorded, WaveFormat format)
    {
        if (bytesRecorded == 0) return 0f;

        double sumSquares = 0;
        int sampleCount = 0;

        if (format.Encoding == WaveFormatEncoding.IeeeFloat && format.BitsPerSample == 32)
        {
            int samples = bytesRecorded / 4;
            for (int i = 0; i < samples; i++)
            {
                float sample = BitConverter.ToSingle(buffer, i * 4);
                sumSquares += sample * sample;
                sampleCount++;
            }
        }
        else if (format.BitsPerSample == 16)
        {
            int samples = bytesRecorded / 2;
            for (int i = 0; i < samples; i++)
            {
                short sample = BitConverter.ToInt16(buffer, i * 2);
                double normalized = sample / 32768.0;
                sumSquares += normalized * normalized;
                sampleCount++;
            }
        }
        else
        {
            return 0f;
        }

        if (sampleCount == 0) return 0f;
        return (float)Math.Sqrt(sumSquares / sampleCount);
    }

    public void Dispose()
    {
        Stop();
        _writer?.Dispose();
        _capture?.Dispose();
    }
}
