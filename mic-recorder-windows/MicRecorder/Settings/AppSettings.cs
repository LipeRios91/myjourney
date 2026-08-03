using System.IO;
using System.Text.Json;

namespace MicRecorder.Settings;

public sealed class AppSettings
{
    public string? MicDeviceId { get; set; }
    public string? SystemDeviceId { get; set; }
    public double SilenceThreshold { get; set; } = 0.02;
    public double SilenceGapSeconds { get; set; } = 2.0;
    public bool StartWithWindows { get; set; }

    private static string FilePath => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
        "MicRecorder", "settings.json");

    public static AppSettings Load()
    {
        try
        {
            if (File.Exists(FilePath))
            {
                var json = File.ReadAllText(FilePath);
                var settings = JsonSerializer.Deserialize<AppSettings>(json);
                if (settings is not null) return settings;
            }
        }
        catch (Exception)
        {
            // arquivo corrompido ou inacessível: cai para os valores padrão
        }

        return new AppSettings();
    }

    public void Save()
    {
        var dir = Path.GetDirectoryName(FilePath)!;
        Directory.CreateDirectory(dir);
        var json = JsonSerializer.Serialize(this, new JsonSerializerOptions { WriteIndented = true });
        File.WriteAllText(FilePath, json);
    }
}
