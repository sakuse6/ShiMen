#define UNICODE
#define _UNICODE

#include <windows.h>
#include <shellapi.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <wchar.h>

static void append_text(wchar_t **buffer, size_t *length, size_t *capacity, const wchar_t *text) {
    size_t text_len = wcslen(text);
    size_t required = *length + text_len + 1;
    if (required > *capacity) {
        while (required > *capacity) {
            *capacity *= 2;
        }
        *buffer = (wchar_t *)realloc(*buffer, (*capacity) * sizeof(wchar_t));
    }
    wmemcpy(*buffer + *length, text, text_len);
    *length += text_len;
    (*buffer)[*length] = L'\0';
}

static void append_quoted_arg(wchar_t **buffer, size_t *length, size_t *capacity, const wchar_t *arg) {
    bool needs_quotes = wcspbrk(arg, L" \t\"") != NULL || arg[0] == L'\0';
    if (!needs_quotes) {
        append_text(buffer, length, capacity, arg);
        return;
    }

    append_text(buffer, length, capacity, L"\"");
    size_t backslashes = 0;

    for (const wchar_t *cursor = arg; *cursor != L'\0'; ++cursor) {
        if (*cursor == L'\\') {
            backslashes += 1;
            continue;
        }

        if (*cursor == L'"') {
            for (size_t i = 0; i < backslashes * 2 + 1; ++i) {
                append_text(buffer, length, capacity, L"\\");
            }
            append_text(buffer, length, capacity, L"\"");
            backslashes = 0;
            continue;
        }

        while (backslashes > 0) {
            append_text(buffer, length, capacity, L"\\");
            backslashes -= 1;
        }

        wchar_t current[2] = { *cursor, L'\0' };
        append_text(buffer, length, capacity, current);
    }

    while (backslashes > 0) {
        append_text(buffer, length, capacity, L"\\\\");
        backslashes -= 1;
    }

    append_text(buffer, length, capacity, L"\"");
}

int wmain(void) {
    SetConsoleCP(CP_UTF8);
    SetConsoleOutputCP(CP_UTF8);
    SetEnvironmentVariableW(L"PYTHONUTF8", L"1");
    SetEnvironmentVariableW(L"PYTHONIOENCODING", L"utf-8");

    wchar_t launcher_path[MAX_PATH];
    DWORD launcher_len = GetModuleFileNameW(NULL, launcher_path, MAX_PATH);
    if (launcher_len == 0 || launcher_len >= MAX_PATH) {
        return 1;
    }

    wchar_t install_root[MAX_PATH];
    wcsncpy_s(install_root, MAX_PATH, launcher_path, _TRUNCATE);
    wchar_t *last_slash = wcsrchr(install_root, L'\\');
    if (!last_slash) {
        return 2;
    }
    *last_slash = L'\0';

    wchar_t core_path[MAX_PATH];
    swprintf(core_path, MAX_PATH, L"%ls\\core\\Lmentor-core.exe", install_root);

    if (GetFileAttributesW(core_path) == INVALID_FILE_ATTRIBUTES) {
        MessageBoxW(NULL, L"Missing core executable: core\\Lmentor-core.exe", L"Lmentor", MB_ICONERROR | MB_OK);
        return 3;
    }

    SetEnvironmentVariableW(L"LMENTOR_INSTALL_ROOT", install_root);
    wchar_t r_home[MAX_PATH];
    swprintf(r_home, MAX_PATH, L"%ls\\runtime\\R-4.5.3", install_root);
    if (GetFileAttributesW(r_home) != INVALID_FILE_ATTRIBUTES) {
        SetEnvironmentVariableW(L"R_HOME", r_home);
        wchar_t r_path[MAX_PATH * 2];
        wchar_t current_path[MAX_PATH * 2];
        DWORD current_len = GetEnvironmentVariableW(L"PATH", current_path, MAX_PATH * 2);
        if (current_len > 0 && current_len < MAX_PATH * 2) {
            swprintf(r_path, MAX_PATH * 2, L"%ls\\bin;%ls", r_home, current_path);
            SetEnvironmentVariableW(L"PATH", r_path);
        }
    }
    SetCurrentDirectoryW(install_root);

    int argc = 0;
    wchar_t **argv = CommandLineToArgvW(GetCommandLineW(), &argc);
    if (!argv) {
        return 4;
    }

    size_t capacity = 8192;
    size_t length = 0;
    wchar_t *command_line = (wchar_t *)calloc(capacity, sizeof(wchar_t));
    if (!command_line) {
        LocalFree(argv);
        return 5;
    }

    append_quoted_arg(&command_line, &length, &capacity, core_path);
    for (int i = 1; i < argc; ++i) {
        append_text(&command_line, &length, &capacity, L" ");
        append_quoted_arg(&command_line, &length, &capacity, argv[i]);
    }

    STARTUPINFOW startup_info;
    PROCESS_INFORMATION process_info;
    ZeroMemory(&startup_info, sizeof(startup_info));
    ZeroMemory(&process_info, sizeof(process_info));
    startup_info.cb = sizeof(startup_info);

    BOOL ok = CreateProcessW(
        core_path,
        command_line,
        NULL,
        NULL,
        TRUE,
        CREATE_UNICODE_ENVIRONMENT,
        NULL,
        install_root,
        &startup_info,
        &process_info
    );

    free(command_line);
    LocalFree(argv);

    if (!ok) {
        MessageBoxW(NULL, L"Failed to launch core runtime.", L"Lmentor", MB_ICONERROR | MB_OK);
        return 6;
    }

    CloseHandle(process_info.hThread);
    WaitForSingleObject(process_info.hProcess, INFINITE);

    DWORD exit_code = 0;
    GetExitCodeProcess(process_info.hProcess, &exit_code);
    CloseHandle(process_info.hProcess);
    if (exit_code == 0xC000001D) {
        MessageBoxW(
            NULL,
            L"The core runtime stopped with error 0xC000001D (illegal CPU instruction).\n\n"
            L"This build is not compatible with the processor on this computer. "
            L"Install a build compiled for the generic x86-64 CPU baseline.",
            L"Lmentor startup failed",
            MB_ICONERROR | MB_OK
        );
    } else if (exit_code >= 0xC0000000) {
        wchar_t message[768];
        swprintf(
            message,
            768,
            L"The core runtime could not start (error 0x%08lX).\n\nPlease check Windows runtime components and antivirus quarantine, then review logs\\main.log.",
            exit_code
        );
        MessageBoxW(NULL, message, L"Lmentor startup failed", MB_ICONERROR | MB_OK);
    }
    return (int)exit_code;
}
