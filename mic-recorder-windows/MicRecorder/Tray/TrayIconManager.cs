using System.Drawing;
using System.Windows.Forms;

namespace MicRecorder.Tray;

public sealed class TrayIconManager : IDisposable
{
    private readonly NotifyIcon _notifyIcon;
    private readonly ToolStripMenuItem _toggleRecordingItem;
    private readonly ToolStripMenuItem _startWithWindowsItem;

    public event EventHandler? ToggleRecordingRequested;
    public event EventHandler? OpenSettingsRequested;
    public event EventHandler? ExitRequested;
    public event EventHandler<bool>? StartWithWindowsToggled;

    public TrayIconManager()
    {
        _toggleRecordingItem = new ToolStripMenuItem("Iniciar gravação", null, (_, _) => ToggleRecordingRequested?.Invoke(this, EventArgs.Empty));
        var settingsItem = new ToolStripMenuItem("Configurações...", null, (_, _) => OpenSettingsRequested?.Invoke(this, EventArgs.Empty));
        _startWithWindowsItem = new ToolStripMenuItem("Iniciar com o Windows")
        {
            CheckOnClick = true
        };
        _startWithWindowsItem.Click += (_, _) => StartWithWindowsToggled?.Invoke(this, _startWithWindowsItem.Checked);
        var exitItem = new ToolStripMenuItem("Sair", null, (_, _) => ExitRequested?.Invoke(this, EventArgs.Empty));

        var menu = new ContextMenuStrip();
        menu.Items.Add(_toggleRecordingItem);
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(settingsItem);
        menu.Items.Add(_startWithWindowsItem);
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(exitItem);

        _notifyIcon = new NotifyIcon
        {
            Icon = SystemIcons.Application,
            Text = "Mic Recorder — parado",
            Visible = true,
            ContextMenuStrip = menu
        };

        _notifyIcon.MouseClick += (_, e) =>
        {
            if (e.Button == MouseButtons.Left)
            {
                OpenSettingsRequested?.Invoke(this, EventArgs.Empty);
            }
        };
    }

    public void SetRecordingState(bool isRecording)
    {
        _toggleRecordingItem.Text = isRecording ? "Parar gravação" : "Iniciar gravação";
        _notifyIcon.Text = isRecording ? "Mic Recorder — gravando" : "Mic Recorder — parado";
    }

    public void SetStartWithWindows(bool enabled)
    {
        _startWithWindowsItem.Checked = enabled;
    }

    public void ShowBalloon(string title, string text)
    {
        _notifyIcon.BalloonTipTitle = title;
        _notifyIcon.BalloonTipText = text;
        _notifyIcon.ShowBalloonTip(4000);
    }

    public void Dispose()
    {
        _notifyIcon.Visible = false;
        _notifyIcon.Dispose();
    }
}
