using System;
using System.IO;
using NinetyAgent.Client.Networking;

namespace NinetyAgent.Client.Core;

/// <summary>
/// Deliberately not a full logging framework (Serilog/NLog etc.) — pulling one in would add
/// reflection-heavy config binding and a meaningfully larger trimmed/R2R payload for a kiosk
/// agent that only ever needs "append a timestamped line to today's file, best-effort, never
/// throw". Rotates daily; keeps the last 14 days so a venue's flash drive doesn't fill up
/// silently over months of unattended operation.
/// </summary>
public sealed class FileLogSink : ILogSink, IDisposable
{
    private readonly string _logDirectory;
    private readonly object _writeLock = new();
    private readonly bool _echoToConsole;
    private StreamWriter? _writer;
    private DateOnly _writerDate;

    public FileLogSink(string subFolder, bool echoToConsole = false)
    {
        _echoToConsole = echoToConsole;
        _logDirectory = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "NinetyGamingHouse", subFolder, "logs");
        Directory.CreateDirectory(_logDirectory);
        PruneOldLogs();
    }

    public void Info(string message) => Write("INFO", message);
    public void Warn(string message) => Write("WARN", message);
    public void Error(string message, Exception? ex = null) =>
        Write("ERROR", ex is null ? message : $"{message} :: {ex.GetType().Name}: {ex.Message}");

    public void LogInformation(string message) => Info(message);
    public void LogWarning(string message) => Warn(message);
    public void LogError(string message, Exception? ex = null) => Error(message, ex);

    private void Write(string level, string message)
    {
        var line = $"{DateTimeOffset.Now:yyyy-MM-dd HH:mm:ss.fff} [{level}] {message}";

        if (_echoToConsole)
        {
            Console.WriteLine(line);
        }

        lock (_writeLock)
        {
            try
            {
                EnsureWriterForToday();
                _writer!.WriteLine(line);
                _writer.Flush();
            }
            catch
            {
                // Logging must never be the reason the kiosk agent crashes (e.g. disk full,
                // removable log volume unplugged). Swallow and keep running.
            }
        }
    }

    private void EnsureWriterForToday()
    {
        var today = DateOnly.FromDateTime(DateTime.Now);
        if (_writer is not null && _writerDate == today) return;

        _writer?.Dispose();
        var path = Path.Combine(_logDirectory, $"agent-{today:yyyy-MM-dd}.log");
        _writer = new StreamWriter(new FileStream(path, FileMode.Append, FileAccess.Write, FileShare.Read))
        {
            AutoFlush = false
        };
        _writerDate = today;
    }

    private void PruneOldLogs()
    {
        try
        {
            var cutoff = DateTime.Now.AddDays(-14);
            foreach (var file in Directory.EnumerateFiles(_logDirectory, "agent-*.log"))
            {
                if (File.GetLastWriteTime(file) < cutoff)
                {
                    File.Delete(file);
                }
            }
        }
        catch { /* best-effort housekeeping */ }
    }

    public void Dispose()
    {
        lock (_writeLock)
        {
            _writer?.Dispose();
        }
    }
}