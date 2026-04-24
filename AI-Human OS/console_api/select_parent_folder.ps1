param(
  [Parameter(Mandatory = $true)]
  [string]$InitialPath,

  [Parameter(Mandatory = $true)]
  [string]$DialogTitle,

  [switch]$SkipDialog
)

$typeDefinition = @"
using System;
using System.IO;
using System.Runtime.InteropServices;

public static class ModernFolderPicker
{
    private const uint FOS_PICKFOLDERS = 0x00000020;
    private const uint FOS_FORCEFILESYSTEM = 0x00000040;
    private const uint FOS_PATHMUSTEXIST = 0x00000800;

    private static readonly Guid CLSID_FileOpenDialog = new Guid("DC1C5A9C-E88A-4DDE-A5A1-60F82A20AEF7");
    private static readonly Guid IID_IShellItem = new Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE");

    [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
    private static extern void SHCreateItemFromParsingName(
        [MarshalAs(UnmanagedType.LPWStr)] string pszPath,
        IntPtr pbc,
        ref Guid riid,
        [MarshalAs(UnmanagedType.Interface)] out IShellItem ppv);

    [ComImport]
    [Guid("42f85136-db7e-439c-85f1-e4075d135fc8")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IFileDialog
    {
        [PreserveSig] int Show(IntPtr parent);
        void SetFileTypes(uint cFileTypes, IntPtr rgFilterSpec);
        void SetFileTypeIndex(uint iFileType);
        void GetFileTypeIndex(out uint piFileType);
        void Advise(IntPtr pfde, out uint pdwCookie);
        void Unadvise(uint dwCookie);
        void SetOptions(uint fos);
        void GetOptions(out uint pfos);
        void SetDefaultFolder(IShellItem psi);
        void SetFolder(IShellItem psi);
        void GetFolder(out IShellItem ppsi);
        void GetCurrentSelection(out IShellItem ppsi);
        void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string pszName);
        void GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string pszName);
        void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string pszTitle);
        void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string pszText);
        void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string pszLabel);
        void GetResult(out IShellItem ppsi);
        void AddPlace(IShellItem psi, uint fdap);
        void SetDefaultExtension([MarshalAs(UnmanagedType.LPWStr)] string pszDefaultExtension);
        void Close(int hr);
        void SetClientGuid(ref Guid guid);
        void ClearClientData();
        void SetFilter(IntPtr pFilter);
    }

    [ComImport]
    [Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IShellItem
    {
        void BindToHandler(IntPtr pbc, ref Guid bhid, ref Guid riid, out IntPtr ppv);
        void GetParent(out IShellItem ppsi);
        void GetDisplayName(SIGDN sigdnName, out IntPtr ppszName);
        void GetAttributes(uint sfgaoMask, out uint psfgaoAttribs);
        void Compare(IShellItem psi, uint hint, out int piOrder);
    }

    private enum SIGDN : uint
    {
        FILESYSPATH = 0x80058000
    }

    public static string Show(string title, string initialPath)
    {
        IFileDialog dialog = null;
        IShellItem defaultFolder = null;

        try
        {
            dialog = (IFileDialog)Activator.CreateInstance(Type.GetTypeFromCLSID(CLSID_FileOpenDialog));
            uint options;
            dialog.GetOptions(out options);
            dialog.SetOptions(options | FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM | FOS_PATHMUSTEXIST);
            dialog.SetTitle(title);
            dialog.SetOkButtonLabel("Choose Folder");

            if (!string.IsNullOrWhiteSpace(initialPath) && Directory.Exists(initialPath))
            {
                defaultFolder = CreateShellItem(initialPath);
                dialog.SetDefaultFolder(defaultFolder);
            }

            const int ERROR_CANCELLED = unchecked((int)0x800704C7);
            int result = dialog.Show(IntPtr.Zero);
            if (result == ERROR_CANCELLED)
            {
                return null;
            }
            if (result < 0)
            {
                Marshal.ThrowExceptionForHR(result);
            }

            IShellItem selectedItem;
            dialog.GetResult(out selectedItem);
            return GetFileSystemPath(selectedItem);
        }
        finally
        {
            if (defaultFolder != null)
            {
                Marshal.FinalReleaseComObject(defaultFolder);
            }
            if (dialog != null)
            {
                Marshal.FinalReleaseComObject(dialog);
            }
        }
    }

    private static IShellItem CreateShellItem(string path)
    {
        Guid iid = IID_IShellItem;
        IShellItem item;
        SHCreateItemFromParsingName(path, IntPtr.Zero, ref iid, out item);
        return item;
    }

    private static string GetFileSystemPath(IShellItem item)
    {
        IntPtr pointer;
        item.GetDisplayName(SIGDN.FILESYSPATH, out pointer);
        try
        {
            return Marshal.PtrToStringUni(pointer);
        }
        finally
        {
            Marshal.FreeCoTaskMem(pointer);
            if (item != null)
            {
                Marshal.FinalReleaseComObject(item);
            }
        }
    }
}
"@

Add-Type -TypeDefinition $typeDefinition

if ($SkipDialog) {
  Write-Output "__SKIPPED__"
  exit 0
}

$selectedPath = [ModernFolderPicker]::Show($DialogTitle, $InitialPath)

if ([string]::IsNullOrWhiteSpace($selectedPath)) {
  Write-Output "__CANCELLED__"
  exit 0
}

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Write-Output $selectedPath
