using System.Windows;
using System.Windows.Threading;

namespace MicRecorder;

public partial class VoiceDetectedWindow : Window
{
    private static readonly TimeSpan AutoCloseAfter = TimeSpan.FromSeconds(20);

    private readonly DispatcherTimer _autoCloseTimer;
    private bool _answered;

    public event EventHandler<bool>? Answered;

    public VoiceDetectedWindow()
    {
        InitializeComponent();

        const double margin = 16;
        Left = SystemParameters.WorkArea.Right - Width - margin;
        Top = SystemParameters.WorkArea.Bottom - Height - margin;

        _autoCloseTimer = new DispatcherTimer { Interval = AutoCloseAfter };
        _autoCloseTimer.Tick += (_, _) => Respond(false);
        _autoCloseTimer.Start();
    }

    private void AcceptButton_Click(object sender, RoutedEventArgs e) => Respond(true);

    private void DeclineButton_Click(object sender, RoutedEventArgs e) => Respond(false);

    private void Respond(bool accepted)
    {
        if (_answered) return;
        _answered = true;

        _autoCloseTimer.Stop();
        Answered?.Invoke(this, accepted);
        Close();
    }
}
