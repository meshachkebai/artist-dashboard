import React from 'react';
import './MetadataAnalysisProgress.css';

/**
 * Progress indicator for metadata analysis
 * Shows current stage and progress percentage
 */
export const MetadataAnalysisProgress = ({ stage, progress, currentFile }) => {
  const stages = {
    reading: { label: 'Reading file', icon: '📁' },
    metadata: { label: 'Extracting metadata', icon: '🎵' },
    bpm: { label: 'Detecting BPM', icon: '🎼' },
    loudness: { label: 'Analyzing loudness', icon: '🔊' },
    complete: { label: 'Complete', icon: '✓' }
  };

  const currentStage = stages[stage] || stages.reading;

  return (
    <div className="metadata-analysis-progress">
      <div className="progress-header">
        <span className="progress-icon">{currentStage.icon}</span>
        <span className="progress-label">{currentStage.label}</span>
      </div>
      
      {currentFile && (
        <div className="progress-filename">{currentFile}</div>
      )}
      
      <div className="progress-bar-container">
        <div 
          className="progress-bar-fill" 
          style={{ width: `${progress}%` }}
        />
      </div>
      
      <div className="progress-percentage">{Math.round(progress)}%</div>
      
      <div className="progress-stages">
        {Object.entries(stages).map(([key, { label }]) => (
          <div 
            key={key}
            className={`stage-indicator ${stage === key ? 'active' : ''} ${
              Object.keys(stages).indexOf(key) < Object.keys(stages).indexOf(stage) ? 'completed' : ''
            }`}
          >
            {label}
          </div>
        ))}
      </div>
    </div>
  );
};
