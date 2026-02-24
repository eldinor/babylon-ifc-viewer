import { useRef, useCallback } from "react";
import { FolderOpenIcon, SettingsIcon, HelpIcon } from "./Icons";

interface HeaderProps {
  onFileSelected: (file: File) => void;
}

export default function Header({ onFileSelected }: HeaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleOpenIfc = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        onFileSelected(file);
      }
      // Reset input so same file can be selected again
      if (event.target) {
        event.target.value = "";
      }
    },
    [onFileSelected],
  );

  return (
    <header className="header">
      <span className="header-title">Babylon.js IFC Viewer</span>
      <div className="header-icons">
        <button
          className="open-ifc-btn"
          onClick={handleOpenIfc}
          title="Open IFC File"
        >
          <FolderOpenIcon />
          <span>Open IFC</span>
        </button>
        <button className="header-icon-btn" title="Settings">
          <SettingsIcon />
        </button>
        <button className="header-icon-btn" title="Help">
          <HelpIcon />
        </button>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".ifc"
        onChange={handleFileChange}
        style={{ display: "none" }}
      />
    </header>
  );
}
