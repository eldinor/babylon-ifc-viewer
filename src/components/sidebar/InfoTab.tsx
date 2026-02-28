import type { ProjectInfoResult } from "../../loader";

interface InfoTabProps {
  projectInfo: ProjectInfoResult | null;
}

function InfoTab({ projectInfo }: InfoTabProps) {
  return (
    <div className="tab-panel">
      <h3>Info</h3>
      <div className="project-info">
        {projectInfo ? (
          <>
            {projectInfo.projectName && (
              <div className="project-item">
                <span className="project-label">Project Name:</span>
                <span className="project-value">{projectInfo.projectName}</span>
              </div>
            )}
            {projectInfo.projectDescription && (
              <div className="project-item">
                <span className="project-label">Description:</span>
                <span className="project-value">{projectInfo.projectDescription}</span>
              </div>
            )}
            {projectInfo.application && (
              <div className="project-item">
                <span className="project-label">Application:</span>
                <span className="project-value">{projectInfo.application}</span>
              </div>
            )}
            {projectInfo.author && (
              <div className="project-item">
                <span className="project-label">Author:</span>
                <span className="project-value">{projectInfo.author}</span>
              </div>
            )}
            {projectInfo.organization && (
              <div className="project-item">
                <span className="project-label">Organization:</span>
                <span className="project-value">{projectInfo.organization}</span>
              </div>
            )}
          </>
        ) : (
          <div className="project-item">
            <span className="project-value">No IFC model loaded. Click "Open IFC" to load a file.</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default InfoTab;
