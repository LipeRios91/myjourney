using System.Diagnostics;
using System.IO;
using System.Windows;
using MicRecorder.Audio;
using NAudio.CoreAudioApi;

namespace MicRecorder;

public partial class MainWindow : Window
{
    private static readonly string OutputFolder = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments),
        "MicRecorder", "Gravacoes");

    private List<MicDevice> _devices = new();
    private SegmentingRecorder? _recorder;

    public MainWindow()
    {
        InitializeComponent();
        LoadDevices();
    }

    private void LoadDevices()
    {
        var previousSelection = (DeviceComboBox.SelectedItem as MicDevice)?.Id;

        _devices = MicDevice.ListActive();
        DeviceComboBox.ItemsSource = _devices;

        if (_devices.Count == 0)
        {
            StatusText.Text = "Nenhum microfone encontrado.";
            return;
        }

        var restored = _devices.FirstOrDefault(d => d.Id == previousSelection);
        DeviceComboBox.SelectedItem = restored ?? _devices[0];
    }

    private void RefreshDevicesButton_Click(object sender, RoutedEventArgs e)
    {
        if (_recorder?.IsRecording == true)
        {
            StatusText.Text = "Pare a gravação antes de atualizar os dispositivos.";
            return;
        }

        LoadDevices();
    }

    private void StartStopButton_Click(object sender, RoutedEventArgs e)
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
        if (DeviceComboBox.SelectedItem is not MicDevice selected)
        {
            StatusText.Text = "Selecione um microfone antes de iniciar.";
            return;
        }

        var settings = new RecorderSettings
        {
            OutputFolder = OutputFolder,
            SilenceThreshold = ThresholdSlider.Value,
            SilenceGap = TimeSpan.FromSeconds(GapSlider.Value)
        };

        _recorder = new SegmentingRecorder(settings);
        _recorder.LevelChanged += OnLevelChanged;
        _recorder.SegmentStarted += OnSegmentStarted;
        _recorder.SegmentFinished += OnSegmentFinished;
        _recorder.ErrorOccurred += OnRecorderError;
        _recorder.Stopped += OnRecorderStopped;

        try
        {
            _recorder.Start(selected.Device);
        }
        catch (Exception ex)
        {
            StatusText.Text = $"Falha ao iniciar: {ex.Message}";
            _recorder.Dispose();
            _recorder = null;
            return;
        }

        DeviceComboBox.IsEnabled = false;
        RefreshDevicesButton.IsEnabled = false;
        ThresholdSlider.IsEnabled = false;
        GapSlider.IsEnabled = false;
        StartStopButton.Content = "Parar gravação";
        StatusText.Text = "Ouvindo o microfone… aguardando fala.";
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
            DeviceComboBox.IsEnabled = true;
            RefreshDevicesButton.IsEnabled = true;
            ThresholdSlider.IsEnabled = true;
            GapSlider.IsEnabled = true;
            StartStopButton.IsEnabled = true;
            StartStopButton.Content = "Iniciar gravação";
            LevelBar.Value = 0;
            StatusText.Text = "Parado.";

            if (_recorder is not null)
            {
                _recorder.LevelChanged -= OnLevelChanged;
                _recorder.SegmentStarted -= OnSegmentStarted;
                _recorder.SegmentFinished -= OnSegmentFinished;
                _recorder.ErrorOccurred -= OnRecorderError;
                _recorder.Stopped -= OnRecorderStopped;
                _recorder.Dispose();
                _recorder = null;
            }
        });
    }

    private void OnLevelChanged(object? sender, float level)
    {
        Dispatcher.Invoke(() => LevelBar.Value = level);
    }

    private void OnSegmentStarted(object? sender, string path)
    {
        Dispatcher.Invoke(() => StatusText.Text = $"Gravando: {Path.GetFileName(path)}");
    }

    private void OnSegmentFinished(object? sender, string path)
    {
        Dispatcher.Invoke(() =>
        {
            RecordingsList.Items.Insert(0, Path.GetFileName(path));
            StatusText.Text = "Ouvindo o microfone… aguardando fala.";
        });
    }

    private void OnRecorderError(object? sender, Exception ex)
    {
        Dispatcher.Invoke(() => StatusText.Text = $"Erro: {ex.Message}");
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

    protected override void OnClosed(EventArgs e)
    {
        _recorder?.Dispose();
        base.OnClosed(e);
    }
}
