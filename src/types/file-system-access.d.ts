/* The File System Access API, as much of it as this app uses. TypeScript's DOM
   lib ships the handle interfaces but not the pickers or the permission
   methods, which are still Chromium-only. */

interface FileSystemHandlePermissionDescriptor { mode?: 'read' | 'readwrite' }

interface FileSystemHandle {
    queryPermission?(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
    requestPermission?(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
}

interface DirectoryPickerOptions {
    id?: string;
    mode?: 'read' | 'readwrite';
    startIn?: FileSystemHandle | string;
}

interface SaveFilePickerOptions {
    suggestedName?: string;
    types?: { description?: string; accept: Record<string, string[]> }[];
}

interface OpenFilePickerOptions extends SaveFilePickerOptions {
    multiple?: boolean;
}

interface Window {
    showDirectoryPicker?(options?: DirectoryPickerOptions): Promise<FileSystemDirectoryHandle>;
    showSaveFilePicker?(options?: SaveFilePickerOptions): Promise<FileSystemFileHandle>;
    showOpenFilePicker?(options?: OpenFilePickerOptions): Promise<FileSystemFileHandle[]>;
}
