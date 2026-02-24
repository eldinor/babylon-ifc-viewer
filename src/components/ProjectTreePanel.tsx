export default function ProjectTreePanel() {
  return (
    <div className="tab-panel">
      <h3>Project Tree</h3>
      <div className="project-tree">
        <div className="tree-item">
          <span className="tree-expand">&#9660;</span>
          <span className="tree-name">Sample Building</span>
        </div>
        <div className="tree-children">
          <div className="tree-item">
            <span className="tree-expand">&#9660;</span>
            <span className="tree-name">Site</span>
          </div>
          <div className="tree-children">
            <div className="tree-item">
              <span className="tree-expand">&#9660;</span>
              <span className="tree-name">Building</span>
            </div>
            <div className="tree-children">
              <div className="tree-item">
                <span className="tree-expand">&#9654;</span>
                <span className="tree-name">Ground Floor</span>
              </div>
              <div className="tree-item">
                <span className="tree-expand">&#9654;</span>
                <span className="tree-name">First Floor</span>
              </div>
              <div className="tree-item">
                <span className="tree-expand">&#9654;</span>
                <span className="tree-name">Roof</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
