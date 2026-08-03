using NAudio.CoreAudioApi;
using NAudio.Wave;

namespace MicRecorder.Audio;

/// <summary>
/// Escuta o microfone em modo leve só para medir volume — nunca grava nem persiste
/// nenhum áudio em disco. Existe apenas para detectar "o usuário começou a falar"
/// e disparar um evento; quem decide o que fazer com isso é quem consome o evento.
/// </summary>
public sealed class VoiceActivityMonitor : IDisposable
{
    private WasapiCapture? _capture;
    private DateTime _voiceStartUtc;
    private bool _voiceActive;
    private bool _notifiedThisBurst;

    public event EventHandler? VoiceDetected;
    public event EventHandler<Exception>? ErrorOccurred;

    public double Threshold { get; set; } = 0.02;
    public TimeSpan MinimumVoiceDuration { get; set; } = TimeSpan.FromMilliseconds(400);

    public bool IsRunning => _capture is not null;

    public void Start(MMDevice device)
    {
        if (IsRunning) return;

        _voiceActive = false;
        _notifiedThisBurst = false;

        _capture = new WasapiCapture(device, false, 100);
        _capture.DataAvailable += OnDataAvailable;
        _capture.RecordingStopped += OnRecordingStopped;
        _capture.StartRecording();
    }

    public void Stop()
    {
        _capture?.StopRecording();
    }

    private void OnDataAvailable(object? sender, WaveInEventArgs e)
    {
        if (_capture is null) return;

        float rms = AudioLevel.ComputeRms(e.Buffer, e.BytesRecorded, _capture.WaveFormat);
        bool loud = rms >= Threshold;
        var now = DateTime.UtcNow;

        if (loud)
        {
            if (!_voiceActive)
            {
                _voiceActive = true;
                _notifiedThisBurst = false;
                _voiceStartUtc = now;
            }
            else if (!_notifiedThisBurst && now - _voiceStartUtc >= MinimumVoiceDuration)
            {
                _notifiedThisBurst = true;
                VoiceDetected?.Invoke(this, EventArgs.Empty);
            }
        }
        else
        {
            _voiceActive = false;
        }
    }

    private void OnRecordingStopped(object? sender, StoppedEventArgs e)
    {
        if (e.Exception is not null)
        {
            ErrorOccurred?.Invoke(this, e.Exception);
        }

        _capture?.Dispose();
        _capture = null;
    }

    public void Dispose() => Stop();
}
