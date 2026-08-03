using System.Runtime.InteropServices;
using NAudio.CoreAudioApi;

namespace MicRecorder.Audio;

public sealed class MicDevice
{
    public required string Id { get; init; }
    public required string FriendlyName { get; init; }
    public required MMDevice Device { get; init; }

    public override string ToString() => FriendlyName;

    public static List<MicDevice> ListActive()
    {
        using var enumerator = new MMDeviceEnumerator();
        var result = new List<MicDevice>();
        foreach (var device in enumerator.EnumerateAudioEndPoints(DataFlow.Capture, DeviceState.Active))
        {
            result.Add(new MicDevice
            {
                Id = device.ID,
                FriendlyName = device.FriendlyName,
                Device = device
            });
        }
        return result;
    }

    public static MMDevice? GetDefault()
    {
        using var enumerator = new MMDeviceEnumerator();
        try
        {
            return enumerator.GetDefaultAudioEndpoint(DataFlow.Capture, Role.Communications);
        }
        catch (COMException)
        {
            return null;
        }
    }
}
