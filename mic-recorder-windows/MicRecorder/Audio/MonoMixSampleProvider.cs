using System.Buffers;
using NAudio.Wave;

namespace MicRecorder.Audio;

/// <summary>
/// Reduz uma fonte com N canais para mono, fazendo a média de todos os canais.
/// Evita depender de conversores prontos que só cobrem estéreo — a saída de sistema
/// pode estar configurada como 5.1/7.1 dependendo do hardware do usuário.
/// </summary>
public sealed class MonoMixSampleProvider : ISampleProvider
{
    private readonly ISampleProvider _source;
    private readonly int _sourceChannels;

    public WaveFormat WaveFormat { get; }

    public MonoMixSampleProvider(ISampleProvider source)
    {
        _source = source;
        _sourceChannels = source.WaveFormat.Channels;
        WaveFormat = WaveFormat.CreateIeeeFloatWaveFormat(source.WaveFormat.SampleRate, 1);
    }

    public int Read(float[] buffer, int offset, int count)
    {
        if (_sourceChannels == 1)
        {
            return _source.Read(buffer, offset, count);
        }

        var temp = ArrayPool<float>.Shared.Rent(count * _sourceChannels);
        try
        {
            int samplesRead = _source.Read(temp, 0, count * _sourceChannels);
            int framesRead = samplesRead / _sourceChannels;

            for (int frame = 0; frame < framesRead; frame++)
            {
                float sum = 0f;
                for (int ch = 0; ch < _sourceChannels; ch++)
                {
                    sum += temp[frame * _sourceChannels + ch];
                }
                buffer[offset + frame] = sum / _sourceChannels;
            }

            return framesRead;
        }
        finally
        {
            ArrayPool<float>.Shared.Return(temp);
        }
    }
}
