using NAudio.Wave;

namespace MicRecorder.Audio;

public static class AudioLevel
{
    /// <summary>RMS (0..1) de um buffer bruto capturado pelo WASAPI, aceitando PCM 16-bit ou IEEE float 32-bit.</summary>
    public static float ComputeRms(byte[] buffer, int bytesRecorded, WaveFormat format)
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

    /// <summary>RMS (0..1) de um bloco de amostras float já normalizadas (-1..1), usado na mixagem.</summary>
    public static float ComputeRms(float[] samples, int count)
    {
        if (count == 0) return 0f;

        double sumSquares = 0;
        for (int i = 0; i < count; i++)
        {
            sumSquares += (double)samples[i] * samples[i];
        }
        return (float)Math.Sqrt(sumSquares / count);
    }
}
