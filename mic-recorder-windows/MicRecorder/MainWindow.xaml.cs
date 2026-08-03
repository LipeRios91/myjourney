using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Windows;
using MicRecorder.Audio;
using MicRecorder.Settings;
using MicRecorder.Tray;
using NAudio.CoreAudioApi;

namespace MicRecorder;

public partial class MainWindow : Window
{
    private static readonly string OutputFolder = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments),
        "MicRecorder", "Gravacoes");

    private readonly AppSettings _settings;
    private readonly VoiceActivityMonitor _voiceMonitor = new();

    private List<AudioDeviceInfo> _micDevices = new();
    private List<AudioDeviceInfo> _systemDevices = new();
    private DualSourceRecorder? _recorder;
    private VoiceDetectedWindow? _voicePrompt;
    private DateTime? _voiceSnoozeUntilUtc;
    private bool _reallyExit;
    private bool _hiddenBalloonShown;

    public event EventHandler<bool>? RecordingStateChanged;

    public TrayIconManager? Tray { get; set; }

    public MainWindow()
    {
        InitializeComponent();

        _settings = AppSettings.Load();
        ThresholdSlider.Value = _settings.SilenceThreshold;
        GapSlider.Value = _settings.SilenceGapSeconds;

        // conecta os eventos do monitor antes de carregar dispositivos, já que selecionar
        // um microfone abaixo pode disparar o início do monitor de voz imediatamente
        _voiceMonitor.VoiceDetected += OnVoiceDetected;
        _voiceMonitor.ErrorOccurred += (_, ex) => Dispatcher.Invoke(() => StatusText.Text = $"Erro no monitor de voz: {ex.Message}");

        LoadDevices();

        StartVoiceMonitorIfIdle();
    }

    private void LoadDevices()
    {
        var previousMic = (MicDeviceComboBox.SelectedItem as AudioDeviceInfo)?.Id ?? _settings.MicDeviceId;
        var previousSystem = (SystemDeviceComboBox.SelectedItem as AudioDeviceInfo)?.Id ?? _settings.SystemDeviceId;

        _micDevices = AudioDeviceInfo.List(DataFlow.Capture);
        _systemDevices = AudioDeviceInfo.List(DataFlow.Render);

        MicDeviceComboBox.ItemsSource = _micDevices;
        SystemDeviceComboBox.ItemsSource = _systemDevices;

        var defaultMic = AudioDeviceInfo.GetDefault(DataFlow.Capture);
        var defaultSystem = AudioDeviceInfo.GetDefault(DataFlow.Render);

        MicDeviceComboBox.SelectedItem = _micDevices.FirstOrDefault(d => d.Id == previousMic)
            ?? _micDevices.FirstOrDefault(d => d.Id == defaultMic?.ID)
            ?? _micDevices.FirstOrDefault();

        SystemDeviceComboBox.SelectedItem = _systemDevices.FirstOrDefault(d => d.Id == previousSystem)
            ?? _systemDevices.FirstOrDefault(d => d.Id == defaultSystem?.ID)
            ?? _systemDevices.FirstOrDefault();

        if (_micDevices.Count == 0)
        {
            StatusText.Text = "Nenhum microfone encontrado.";
        }
        else if (_systemDevices.Count == 0)
        {
            StatusText.Text = "Nenhuma saída de som encontrada.";
        }
    }

    private void RefreshDevicesButton_Click(object sender, RoutedEventArgs e)
    {
        if (_recorder?.IsRecording == true)
        {
            StatusText.Text = "Pare a gravação antes de atualizar os dispositivos.";
            return;
        }

        var wasMonitoring = _voiceMonitor.IsRunning;
        if (wasMonitoring) _voiceMonitor.Stop();

        LoadDevices();

        if (wasMonitoring) StartVoiceMonitorIfIdle();
    }

    private void MicDeviceComboBox_SelectionChanged(object sender, System.Windows.Controls.SelectionChangedEventArgs e)
    {
        if (MicDeviceComboBox.SelectedItem is not AudioDeviceInfo selected) return;

        _settings.MicDeviceId = selected.Id;
        _settings.Save();

        if (_recorder is null)
        {
            _voiceMonitor.Stop();
            StartVoiceMonitorIfIdle();
        }
    }

    private void SystemDeviceComboBox_SelectionChanged(object sender, System.Windows.Controls.SelectionChangedEventArgs e)
    {
        if (SystemDeviceComboBox.SelectedItem is not AudioDeviceInfo selected) return;

        _settings.SystemDeviceId = selected.Id;
        _settings.Save();
    }

    private void StartStopButton_Click(object sender, RoutedEventArgs e) => ToggleRecording();

    public void ToggleRecording()
    {
        if (_recorder?.IsRecording == true)
        {
            StopRecording();
        }
        else
        {
            StartRecording();
        }
    }

    private void StartRecording()
    {
        if (MicDeviceComboBox.SelectedItem is not AudioDeviceInfo mic)
        {
            StatusText.Text = "Selecione um microfone antes de iniciar.";
            return;
        }

        if (SystemDeviceComboBox.SelectedItem is not AudioDeviceInfo system)
        {
            StatusText.Text = "Selecione uma saída de som antes de iniciar.";
            return;
        }

        _voiceMonitor.Stop();
        CloseVoicePrompt();

        _settings.SilenceThreshold = ThresholdSlider.Value;
        _settings.SilenceGapSeconds = GapSlider.Value;
        _settings.Save();

        var settings = new RecorderSettings
        {
            OutputFolder = OutputFolder,
            SilenceThreshold = ThresholdSlider.Value,
            SilenceGap = TimeSpan.FromSeconds(GapSlider.Value)
        };

        _recorder = new DualSourceRecorder(settings);
        _recorder.MicLevelChanged += OnMicLevelChanged;
        _recorder.SystemLevelChanged += OnSystemLevelChanged;
        _recorder.SegmentStarted += OnSegmentStarted;
        _recorder.SegmentFinished += OnSegmentFinished;
        _recorder.ErrorOccurred += OnRecorderError;
        _recorder.Stopped += OnRecorderStopped;

        try
        {
            _recorder.Start(mic.Device, system.Device);
        }
        catch (Exception ex)
        {
            StatusText.Text = $"Falha ao iniciar: {ex.Message}";
            _recorder.Dispose();
            _recorder = null;
            StartVoiceMonitorIfIdle();
            return;
        }

        MicDeviceComboBox.IsEnabled = false;
        SystemDeviceComboBox.IsEnabled = false;
        RefreshDevicesButton.IsEnabled = false;
        ThresholdSlider.IsEnabled = false;
        GapSlider.IsEnabled = false;
        StartStopButton.Content = "Parar gravação";
        StatusText.Text = "Gravando o dia… aguardando fala ou som.";

        RecordingStateChanged?.Invoke(this, true);
    }

    private void StopRecording()
    {
        _recorder?.Stop();
        StartStopButton.IsEnabled = false;
        StatusText.Text = "Finalizando…";
    }

    private void OnRecorderStopped(object? sender, EventArgs e)
    {
        Dispatcher.Invoke(() =>
        {
            MicDeviceComboBox.IsEnabled = true;
            SystemDeviceComboBox.IsEnabled = true;
            RefreshDevicesButton.IsEnabled = true;
            ThresholdSlider.IsEnabled = true;
            GapSlider.IsEnabled = true;
            StartStopButton.IsEnabled = true;
            StartStopButton.Content = "Iniciar gravação";
            MicLevelBar.Value = 0;
            SystemLevelBar.Value = 0;
            StatusText.Text = "Parado.";

            if (_recorder is not null)
            {
                _recorder.MicLevelChanged -= OnMicLevelChanged;
                _recorder.SystemLevelChanged -= OnSystemLevelChanged;
                _recorder.SegmentStarted -= OnSegmentStarted;
                _recorder.SegmentFinished -= OnSegmentFinished;
                _recorder.ErrorOccurred -= OnRecorderError;
                _recorder.Stopped -= OnRecorderStopped;
                _recorder.Dispose();
                _recorder = null;
            }

            RecordingStateChanged?.Invoke(this, false);
            StartVoiceMonitorIfIdle();
        });
    }

    private void OnMicLevelChanged(object? sender, float level) => Dispatcher.Invoke(() => MicLevelBar.Value = level);

    private void OnSystemLevelChanged(object? sender, float level) => Dispatcher.Invoke(() => SystemLevelBar.Value = level);

    private void OnSegmentStarted(object? sender, string path)
    {
        Dispatcher.Invoke(() => StatusText.Text = $"Gravando: {Path.GetFileName(path)}");
    }

    private void OnSegmentFinished(object? sender, string path)
    {
        Dispatcher.Invoke(() =>
        {
            RecordingsList.Items.Insert(0, Path.GetFileName(path));
            StatusText.Text = "Gravando o dia… aguardando fala ou som.";
        });
    }

    private void OnRecorderError(object? sender, Exception ex)
    {
        Dispatcher.Invoke(() => StatusText.Text = $"Erro: {ex.Message}");
    }

    private void StartVoiceMonitorIfIdle()
    {
        if (_recorder?.IsRecording == true) return;
        if (_voiceMonitor.IsRunning) return;
        if (MicDeviceComboBox.SelectedItem is not AudioDeviceInfo mic) return;

        try
        {
            _voiceMonitor.Threshold = ThresholdSlider.Value;
            _voiceMonitor.Start(mic.Device);
        }
        catch (Exception ex)
        {
            StatusText.Text = $"Não foi possível monitorar o microfone: {ex.Message}";
        }
    }

    private void OnVoiceDetected(object? sender, EventArgs e)
    {
        Dispatcher.Invoke(() =>
        {
            if (_recorder?.IsRecording == true) return;
            if (_voicePrompt is not null) return;
            if (_voiceSnoozeUntilUtc is { } snooze && DateTime.UtcNow < snooze) return;

            _voicePrompt = new VoiceDetectedWindow();
            _voicePrompt.Answered += OnVoicePromptAnswered;
            _voicePrompt.Show();
        });
    }

    private void OnVoicePromptAnswered(object? sender, bool accepted)
    {
        Dispatcher.Invoke(() =>
        {
            _voicePrompt = null;

            if (accepted)
            {
                StartRecording();
            }
            else
            {
                _voiceSnoozeUntilUtc = DateTime.UtcNow.AddMinutes(5);
            }
        });
    }

    private void CloseVoicePrompt()
    {
        if (_voicePrompt is null) return;
        _voicePrompt.Answered -= OnVoicePromptAnswered;
        _voicePrompt.Close();
        _voicePrompt = null;
    }

    private void OpenFolderButton_Click(object sender, RoutedEventArgs e)
    {
        Directory.CreateDirectory(OutputFolder);
        Process.Start(new ProcessStartInfo
        {
            FileName = OutputFolder,
            UseShellExecute = true
        });
    }

    public void ShowFromTray()
    {
        Show();
        WindowState = WindowState.Normal;
        Activate();
    }

    public void PrepareForExit()
    {
        _reallyExit = true;
        _voiceMonitor.Stop();
        _voiceMonitor.Dispose();
        CloseVoicePrompt();
        _recorder?.Dispose();
        Close();
    }

    protected override void OnClosing(CancelEventArgs e)
    {
        if (!_reallyExit)
        {
            e.Cancel = true;
            Hide();

            if (!_hiddenBalloonShown)
            {
                _hiddenBalloonShown = true;
                Tray?.ShowBalloon("Mic Recorder", "O app continua rodando na bandeja do sistema.");
            }
            return;
        }

        base.OnClosing(e);
    }
}
