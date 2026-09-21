using System;
using System.Threading;
using LibreHardwareMonitor.Hardware;
using NinetyAgent.Client.Core;
using NinetyAgent.Client.Networking;

namespace NinetyAgent.Client.Hardware;

public sealed record TelemetrySnapshot(double CpuTempC, double GpuTempC, int FanSpeedRpm, double CpuLoadPercent);

/// <summary>
/// Reads live CPU/GPU temperature, fan RPM, and CPU load via LibreHardwareMonitorLib.
/// </summary>
public sealed class TelemetryMonitor : IDisposable
{
    private static readonly TimeSpan IdleInterval = TimeSpan.FromSeconds(2);
    private static readonly TimeSpan ActiveInterval = TimeSpan.FromSeconds(5);

    private readonly ILogSink _log;
    private readonly Computer _computer;
    private readonly object _sensorLock = new();
    private Timer? _pollTimer;
    private volatile bool _activeSessionMode;

    public event Action<TelemetrySnapshot>? SnapshotUpdated;
    public TelemetrySnapshot Latest { get; private set; } = new(0, 0, 0, 0);

    public TelemetryMonitor(ILogSink log)
    {
        _log = log;
        _computer = new Computer
        {
            IsCpuEnabled = true,
            IsGpuEnabled = true,
            IsMotherboardEnabled = true,
            IsMemoryEnabled = false,
            IsStorageEnabled = false,
            IsNetworkEnabled = false
        };
    }

    public void Start()
    {
        try
        {
            _computer.Open();
        }
        catch (Exception ex)
        {
            _log.Error("[Telemetry] Failed to open hardware sensors — telemetry will report zeros.", ex);
        }

        ScheduleNextPoll(IdleInterval);
    }

    public void SetActiveSessionMode(bool isActive) => _activeSessionMode = isActive;

    private void ScheduleNextPoll(TimeSpan due)
    {
        _pollTimer?.Dispose();
        _pollTimer = new Timer(_ => PollOnce(), null, due, Timeout.InfiniteTimeSpan);
    }

    private void PollOnce()
    {
        try
        {
            lock (_sensorLock)
            {
                foreach (var hardware in _computer.Hardware)
                {
                    hardware.Update();
                }

                var snapshot = Aggregate();
                Latest = snapshot;
                SnapshotUpdated?.Invoke(snapshot);
            }
        }
        catch (Exception ex)
        {
            _log.Error("[Telemetry] Poll failed (non-fatal).", ex);
        }
        finally
        {
            ScheduleNextPoll(_activeSessionMode ? ActiveInterval : IdleInterval);
        }
    }

    private TelemetrySnapshot Aggregate()
    {
        double cpuTemp = 0, gpuTemp = 0, cpuLoad = 0;
        int fanRpm = 0;

        foreach (var hardware in _computer.Hardware)
        {
            switch (hardware.HardwareType)
            {
                case HardwareType.Cpu:
                    cpuTemp = Math.Max(cpuTemp, MaxSensorValue(hardware, SensorType.Temperature, prefer: "Package"));
                    cpuLoad = Math.Max(cpuLoad, MaxSensorValue(hardware, SensorType.Load, prefer: "Total"));
                    break;

                case HardwareType.GpuNvidia:
                case HardwareType.GpuAmd:
                case HardwareType.GpuIntel:
                    gpuTemp = Math.Max(gpuTemp, MaxSensorValue(hardware, SensorType.Temperature, prefer: "Core"));
                    fanRpm = Math.Max(fanRpm, (int)MaxSensorValue(hardware, SensorType.Fan, prefer: null));
                    break;

                case HardwareType.Motherboard:
                    foreach (var sub in hardware.SubHardware)
                    {
                        sub.Update();
                        fanRpm = Math.Max(fanRpm, (int)MaxSensorValue(sub, SensorType.Fan, prefer: null));
                    }
                    break;
            }
        }

        return new TelemetrySnapshot(cpuTemp, gpuTemp, fanRpm, cpuLoad);
    }

    private static double MaxSensorValue(IHardware hardware, SensorType type, string? prefer)
    {
        double best = 0;
        ISensor? preferred = null;

        foreach (var sensor in hardware.Sensors)
        {
            if (sensor.SensorType != type || sensor.Value is not { } value) continue;
            best = Math.Max(best, value);
            if (prefer is not null && sensor.Name.Contains(prefer, StringComparison.OrdinalIgnoreCase))
            {
                preferred = sensor;
            }
        }

        return preferred?.Value ?? best;
    }

    public void Dispose()
    {
        _pollTimer?.Dispose();
        try { _computer.Close(); } catch { }
    }
}