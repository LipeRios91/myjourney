using System.Runtime.InteropServices;
using NAudio.CoreAudioApi;

namespace MicRecorder.Audio;

public sealed class AudioDeviceInfo
{
    public required string Id { get; init; }
    public required string FriendlyName { get; init; }
    public required MMDevice Device { get; init; }

    public override string ToString() => FriendlyName;

    /// <summary>Lista dispositivos ativos. Use DataFlow.Capture para microfones e DataFlow.Render para saídas (alto-falantes/fones).</summary>
    public static List<AudioDeviceInfo> List(DataFlow flow)
    {
        using var enumerator = new MMDeviceEnumerator();
        var result = new List<AudioDeviceInfo>();
        foreach (var device in enumerator.EnumerateAudioEndPoints(flow, DeviceState.Active))
        {
            result.Add(new AudioDeviceInfo
            {
                Id = device.ID,
                FriendlyName = device.FriendlyName,
                Device = device
            });
        }
        return result;
    }

    public static MMDevice? GetDefault(DataFlow flow, Role role = Role.Multimedia)
    {
        using var enumerator = new MMDeviceEnumerator();
        try
        {
            return enumerator.GetDefaultAudioEndpoint(flow, role);
        }
        catch (COMException)
        {
            return null;
        }
    }
}
