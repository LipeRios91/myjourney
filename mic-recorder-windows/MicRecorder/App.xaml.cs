using System.Windows;
using MicRecorder.Settings;
using MicRecorder.Tray;

namespace MicRecorder;

public partial class App : Application
{
    private TrayIconManager? _tray;
    private MainWindow? _mainWindow;

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        _tray = new TrayIconManager();
        _mainWindow = new MainWindow { Tray = _tray };

        _tray.ToggleRecordingRequested += (_, _) => _mainWindow.ToggleRecording();
        _tray.OpenSettingsRequested += (_, _) => _mainWindow.ShowFromTray();
        _tray.ExitRequested += (_, _) => ExitApplication();
        _tray.StartWithWindowsToggled += OnStartWithWindowsToggled;
        _mainWindow.RecordingStateChanged += (_, isRecording) => _tray.SetRecordingState(isRecording);

        var settings = AppSettings.Load();
        _tray.SetStartWithWindows(settings.StartWithWindows);

        var isFirstRun = string.IsNullOrEmpty(settings.MicDeviceId);
        if (isFirstRun)
        {
            _mainWindow.ShowFromTray();
        }
        else
        {
            // força a criação do handle da janela (necessário pro ciclo de vida do WPF)
            // sem exibi-la — o app roda direto na bandeja até o usuário pedir "Configurações".
            _mainWindow.Show();
            _mainWindow.Hide();
        }
    }

    private void OnStartWithWindowsToggled(object? sender, bool enabled)
    {
        StartupRegistration.SetEnabled(enabled);

        var settings = AppSettings.Load();
        settings.StartWithWindows = enabled;
        settings.Save();
    }

    private void ExitApplication()
    {
        _mainWindow?.PrepareForExit();
        _tray?.Dispose();
        Shutdown();
    }
}
