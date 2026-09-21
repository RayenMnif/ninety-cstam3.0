using System;

namespace NinetyAgent.Client.Core;

public interface ILogSink
{
    void Info(string message);
    void Warn(string message);
    void Error(string message, Exception? ex = null);

    void LogInformation(string message) => Info(message);
    void LogWarning(string message) => Warn(message);
    void LogError(string message, Exception? ex = null) => Error(message, ex);
}