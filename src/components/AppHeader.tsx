import type { ChangeEvent, RefObject } from "react";
import { FolderOpenIcon, HelpIcon, SettingsIcon } from "./Icons";

interface AppHeaderProps {
  fileInputRef: RefObject<HTMLInputElement | null>;
  onOpenIfc: () => void;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
}

function AppHeader({ fileInputRef, onOpenIfc, onFileChange }: AppHeaderProps) {
  return (
    <header className="header">
      <span className="header-title">Babylon.js IFC Viewer</span>
      <div className="header-icons">
        <button className="open-ifc-btn" onClick={onOpenIfc} title="Open IFC File">
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
      <input ref={fileInputRef} type="file" accept=".ifc" onChange={onFileChange} style={{ display: "none" }} />
    </header>
  );
}

export default AppHeader;
