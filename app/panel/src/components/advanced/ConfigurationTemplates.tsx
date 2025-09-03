import React, { useState, useEffect } from 'react';
import './ConfigurationTemplates.css';

interface ConfigurationTemplate {
  id: string;
  name: string;
  description: string;
  version: string;
  created_at: string;
  updated_at: string;
  created_by: string;
  tags: string[];
  configuration: {
    hardware: any;
    lockers: any;
    system: any;
  };
  compatibility: {
    min_version: string;
    max_version?: string;
    hardware_requirements: string[];
  };
  metadata: {
    total_lockers: number;
    total_cards: number;
    card_types: string[];
    layout_type: string;
  };
}

interface ConfigurationTemplatesProps {
  onClose: () => void;
  currentConfiguration?: any;
}

export const ConfigurationTemplates: React.FC<ConfigurationTemplatesProps> = ({
  onClose,
  currentConfiguration
}) => {
  const [activeTab, setActiveTab] = useState<'browse' | 'create' | 'import' | 'export'>('browse');
  const [templates, setTemplates] = useState<ConfigurationTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<ConfigurationTemplate | null>(null);

  // Template creation form
  const [newTemplate, setNewTemplate] = useState({
    name: '',
    description: '',
    tags: '',
    includeHardware: true,
    includeLockers: true,
    includeSystem: false
  });

  // Import/Export state
  const [importData, setImportData] = useState('');
  const [exportFormat, setExportFormat] = useState<'json' | 'yaml'>('json');

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/hardware-config/templates');
      if (response.ok) {
        const data = await response.json();
        setTemplates(data.templates || []);
      } else {
        setError('Failed to load templates');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  };

  const createTemplate = async () => {
    if (!newTemplate.name.trim()) {
      setError('Template name is required');
      return;
    }

    if (!currentConfiguration) {
      setError('No current configuration available');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const templateData = {
        name: newTemplate.name.trim(),
        description: newTemplate.description.trim(),
        tags: newTemplate.tags.split(',').map(tag => tag.trim()).filter(tag => tag),
        configuration: {
          hardware: newTemplate.includeHardware ? currentConfiguration.hardware : undefined,
          lockers: newTemplate.includeLockers ? currentConfiguration.lockers : undefined,
          system: newTemplate.includeSystem ? currentConfiguration.system : undefined
        }
      };

      const response = await fetch('/api/hardware-config/templates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(templateData)
      });

      if (response.ok) {
        const result = await response.json();
        setTemplates(prev => [result.template, ...prev]);
        setNewTemplate({
          name: '',
          description: '',
          tags: '',
          includeHardware: true,
          includeLockers: true,
          includeSystem: false
        });
        setActiveTab('browse');
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to create template');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create template');
    } finally {
      setLoading(false);
    }
  };

  const applyTemplate = async (template: ConfigurationTemplate) => {
    if (!confirm(`Apply template "${template.name}"? This will update your current configuration.`)) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/hardware-config/templates/apply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          template_id: template.id,
          merge_strategy: 'replace' // or 'merge'
        })
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          alert('Template applied successfully! Please refresh the page to see changes.');
        } else {
          setError(result.error || 'Failed to apply template');
        }
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to apply template');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply template');
    } finally {
      setLoading(false);
    }
  };

  const deleteTemplate = async (templateId: string) => {
    if (!confirm('Delete this template? This action cannot be undone.')) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/hardware-config/templates/${templateId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        setTemplates(prev => prev.filter(t => t.id !== templateId));
        if (selectedTemplate?.id === templateId) {
          setSelectedTemplate(null);
        }
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to delete template');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete template');
    } finally {
      setLoading(false);
    }
  };

  const exportTemplate = async (template: ConfigurationTemplate) => {
    try {
      const response = await fetch(`/api/hardware-config/templates/${template.id}/export?format=${exportFormat}`);
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${template.name.replace(/[^a-zA-Z0-9]/g, '_')}.${exportFormat}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      } else {
        setError('Failed to export template');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export template');
    }
  };

  const importTemplate = async () => {
    if (!importData.trim()) {
      setError('Import data is required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/hardware-config/templates/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          data: importData,
          format: 'auto' // Auto-detect format
        })
      });

      if (response.ok) {
        const result = await response.json();
        setTemplates(prev => [result.template, ...prev]);
        setImportData('');
        setActiveTab('browse');
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to import template');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import template');
    } finally {
      setLoading(false);
    }
  };

  const validateTemplate = async (template: ConfigurationTemplate) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/hardware-config/templates/${template.id}/validate`, {
        method: 'POST'
      });

      if (response.ok) {
        const result = await response.json();
        if (result.valid) {
          alert('Template is valid and compatible with current system');
        } else {
          alert(`Template validation failed:\n${result.errors.join('\n')}`);
        }
      } else {
        setError('Failed to validate template');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to validate template');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getCompatibilityStatus = (template: ConfigurationTemplate) => {
    // Simple compatibility check based on version
    const currentVersion = '1.0.0'; // This should come from system info
    const minVersion = template.compatibility.min_version;
    const maxVersion = template.compatibility.max_version;

    if (maxVersion && currentVersion > maxVersion) {
      return { status: 'incompatible', message: 'System version too new' };
    }
    if (currentVersion < minVersion) {
      return { status: 'incompatible', message: 'System version too old' };
    }
    return { status: 'compatible', message: 'Compatible' };
  };

  return (
    <div className="configuration-templates">
      <div className="templates-header">
        <div className="header-left">
          <h3>
            <i className="fas fa-file-alt"></i>
            Configuration Templates
          </h3>
          <p>Save, share, and reuse hardware configurations</p>
        </div>
        <button className="btn-close" onClick={onClose}>
          <i className="fas fa-times"></i>
        </button>
      </div>

      <div className="config-tabs">
        <button
          className={`tab ${activeTab === 'browse' ? 'active' : ''}`}
          onClick={() => setActiveTab('browse')}
        >
          <i className="fas fa-list"></i>
          Browse Templates
        </button>
        <button
          className={`tab ${activeTab === 'create' ? 'active' : ''}`}
          onClick={() => setActiveTab('create')}
        >
          <i className="fas fa-plus"></i>
          Create Template
        </button>
        <button
          className={`tab ${activeTab === 'import' ? 'active' : ''}`}
          onClick={() => setActiveTab('import')}
        >
          <i className="fas fa-upload"></i>
          Import
        </button>
        <button
          className={`tab ${activeTab === 'export' ? 'active' : ''}`}
          onClick={() => setActiveTab('export')}
        >
          <i className="fas fa-download"></i>
          Export
        </button>
      </div>

      <div className="config-content">
        {error && (
          <div className="error-message">
            <i className="fas fa-exclamation-circle"></i>
            <div>
              <strong>Error</strong>
              <p>{error}</p>
            </div>
            <button onClick={() => setError(null)}>
              <i className="fas fa-times"></i>
            </button>
          </div>
        )}

        {activeTab === 'browse' && (
          <div className="browse-templates">
            <div className="templates-toolbar">
              <button className="btn-secondary" onClick={loadTemplates} disabled={loading}>
                <i className="fas fa-sync-alt"></i>
                Refresh
              </button>
              <div className="templates-count">
                {templates.length} template{templates.length !== 1 ? 's' : ''}
              </div>
            </div>

            {loading && (
              <div className="loading-spinner">
                <i className="fas fa-spinner fa-spin"></i>
                Loading templates...
              </div>
            )}

            <div className="templates-grid">
              {templates.map(template => {
                const compatibility = getCompatibilityStatus(template);
                return (
                  <div key={template.id} className="template-card">
                    <div className="template-header">
                      <div className="template-info">
                        <h4>{template.name}</h4>
                        <p>{template.description}</p>
                      </div>
                      <div className="template-actions">
                        <button
                          className="btn-icon"
                          onClick={() => setSelectedTemplate(template)}
                          title="View Details"
                        >
                          <i className="fas fa-eye"></i>
                        </button>
                        <button
                          className="btn-icon"
                          onClick={() => validateTemplate(template)}
                          title="Validate"
                        >
                          <i className="fas fa-check"></i>
                        </button>
                        <button
                          className="btn-icon"
                          onClick={() => exportTemplate(template)}
                          title="Export"
                        >
                          <i className="fas fa-download"></i>
                        </button>
                        <button
                          className="btn-icon btn-danger"
                          onClick={() => deleteTemplate(template.id)}
                          title="Delete"
                        >
                          <i className="fas fa-trash"></i>
                        </button>
                      </div>
                    </div>

                    <div className="template-metadata">
                      <div className="metadata-item">
                        <i className="fas fa-archive"></i>
                        {template.metadata.total_lockers} lockers
                      </div>
                      <div className="metadata-item">
                        <i className="fas fa-microchip"></i>
                        {template.metadata.total_cards} cards
                      </div>
                      <div className="metadata-item">
                        <i className="fas fa-calendar"></i>
                        {formatDate(template.created_at)}
                      </div>
                    </div>

                    <div className="template-tags">
                      {template.tags.map(tag => (
                        <span key={tag} className="tag">{tag}</span>
                      ))}
                    </div>

                    <div className="template-compatibility">
                      <span className={`compatibility-badge ${compatibility.status}`}>
                        {compatibility.message}
                      </span>
                    </div>

                    <div className="template-footer">
                      <button
                        className="btn-primary"
                        onClick={() => applyTemplate(template)}
                        disabled={compatibility.status === 'incompatible'}
                      >
                        <i className="fas fa-play"></i>
                        Apply Template
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {templates.length === 0 && !loading && (
              <div className="empty-state">
                <i className="fas fa-file-alt"></i>
                <h4>No Templates Found</h4>
                <p>Create your first configuration template to get started.</p>
                <button
                  className="btn-primary"
                  onClick={() => setActiveTab('create')}
                >
                  <i className="fas fa-plus"></i>
                  Create Template
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'create' && (
          <div className="create-template">
            <h4>Create New Template</h4>
            <p className="description">
              Save your current configuration as a reusable template.
            </p>

            <div className="form-grid">
              <div className="form-group full-width">
                <label>Template Name *</label>
                <input
                  type="text"
                  value={newTemplate.name}
                  onChange={(e) => setNewTemplate(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Standard 32-Locker Setup"
                />
              </div>

              <div className="form-group full-width">
                <label>Description</label>
                <textarea
                  value={newTemplate.description}
                  onChange={(e) => setNewTemplate(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Describe what this template is for and when to use it"
                  rows={3}
                />
              </div>

              <div className="form-group full-width">
                <label>Tags (comma-separated)</label>
                <input
                  type="text"
                  value={newTemplate.tags}
                  onChange={(e) => setNewTemplate(prev => ({ ...prev, tags: e.target.value }))}
                  placeholder="e.g., production, waveshare, 32-locker"
                />
              </div>
            </div>

            <div className="include-sections">
              <h5>Include in Template</h5>
              <div className="checkbox-grid">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={newTemplate.includeHardware}
                    onChange={(e) => setNewTemplate(prev => ({ ...prev, includeHardware: e.target.checked }))}
                  />
                  Hardware Configuration (relay cards, Modbus settings)
                </label>

                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={newTemplate.includeLockers}
                    onChange={(e) => setNewTemplate(prev => ({ ...prev, includeLockers: e.target.checked }))}
                  />
                  Locker Configuration (layout, naming, settings)
                </label>

                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={newTemplate.includeSystem}
                    onChange={(e) => setNewTemplate(prev => ({ ...prev, includeSystem: e.target.checked }))}
                  />
                  System Settings (database, services, security)
                </label>
              </div>
            </div>

            {currentConfiguration && (
              <div className="template-preview">
                <h5>Template Preview</h5>
                <div className="preview-stats">
                  {newTemplate.includeHardware && (
                    <div className="preview-item">
                      <i className="fas fa-microchip"></i>
                      {currentConfiguration.hardware?.relay_cards?.length || 0} relay cards
                    </div>
                  )}
                  {newTemplate.includeLockers && (
                    <div className="preview-item">
                      <i className="fas fa-archive"></i>
                      {currentConfiguration.lockers?.total_count || 0} lockers
                    </div>
                  )}
                  {newTemplate.includeSystem && (
                    <div className="preview-item">
                      <i className="fas fa-cog"></i>
                      System configuration
                    </div>
                  )}
                </div>
              </div>
            )}

            <button
              className="btn-primary"
              onClick={createTemplate}
              disabled={loading || !newTemplate.name.trim()}
            >
              {loading ? (
                <>
                  <i className="fas fa-spinner fa-spin"></i>
                  Creating...
                </>
              ) : (
                <>
                  <i className="fas fa-save"></i>
                  Create Template
                </>
              )}
            </button>
          </div>
        )}

        {activeTab === 'import' && (
          <div className="import-template">
            <h4>Import Template</h4>
            <p className="description">
              Import a configuration template from JSON or YAML format.
            </p>

            <div className="form-group">
              <label>Template Data</label>
              <textarea
                value={importData}
                onChange={(e) => setImportData(e.target.value)}
                placeholder="Paste your template JSON or YAML data here..."
                rows={15}
                className="import-textarea"
              />
            </div>

            <div className="import-actions">
              <button
                className="btn-secondary"
                onClick={() => setImportData('')}
              >
                <i className="fas fa-eraser"></i>
                Clear
              </button>
              <button
                className="btn-primary"
                onClick={importTemplate}
                disabled={loading || !importData.trim()}
              >
                {loading ? (
                  <>
                    <i className="fas fa-spinner fa-spin"></i>
                    Importing...
                  </>
                ) : (
                  <>
                    <i className="fas fa-upload"></i>
                    Import Template
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {activeTab === 'export' && (
          <div className="export-template">
            <h4>Export Templates</h4>
            <p className="description">
              Export templates for sharing or backup purposes.
            </p>

            <div className="export-options">
              <div className="form-group">
                <label>Export Format</label>
                <select
                  value={exportFormat}
                  onChange={(e) => setExportFormat(e.target.value as 'json' | 'yaml')}
                >
                  <option value="json">JSON</option>
                  <option value="yaml">YAML</option>
                </select>
              </div>
            </div>

            <div className="export-templates-list">
              {templates.map(template => (
                <div key={template.id} className="export-template-item">
                  <div className="template-info">
                    <strong>{template.name}</strong>
                    <p>{template.description}</p>
                    <small>Created: {formatDate(template.created_at)}</small>
                  </div>
                  <button
                    className="btn-primary"
                    onClick={() => exportTemplate(template)}
                  >
                    <i className="fas fa-download"></i>
                    Export
                  </button>
                </div>
              ))}
            </div>

            {templates.length === 0 && (
              <div className="empty-state">
                <i className="fas fa-download"></i>
                <h4>No Templates to Export</h4>
                <p>Create some templates first to export them.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {selectedTemplate && (
        <div className="template-modal">
          <div className="modal-content">
            <div className="modal-header">
              <h4>{selectedTemplate.name}</h4>
              <button onClick={() => setSelectedTemplate(null)}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="modal-body">
              <div className="template-details">
                <div className="detail-section">
                  <h5>Description</h5>
                  <p>{selectedTemplate.description || 'No description provided'}</p>
                </div>

                <div className="detail-section">
                  <h5>Metadata</h5>
                  <div className="metadata-grid">
                    <div>Total Lockers: {selectedTemplate.metadata.total_lockers}</div>
                    <div>Total Cards: {selectedTemplate.metadata.total_cards}</div>
                    <div>Layout: {selectedTemplate.metadata.layout_type}</div>
                    <div>Version: {selectedTemplate.version}</div>
                  </div>
                </div>

                <div className="detail-section">
                  <h5>Card Types</h5>
                  <div className="card-types">
                    {selectedTemplate.metadata.card_types.map(type => (
                      <span key={type} className="card-type-badge">{type}</span>
                    ))}
                  </div>
                </div>

                <div className="detail-section">
                  <h5>Tags</h5>
                  <div className="template-tags">
                    {selectedTemplate.tags.map(tag => (
                      <span key={tag} className="tag">{tag}</span>
                    ))}
                  </div>
                </div>

                <div className="detail-section">
                  <h5>Compatibility</h5>
                  <div className="compatibility-info">
                    <div>Min Version: {selectedTemplate.compatibility.min_version}</div>
                    {selectedTemplate.compatibility.max_version && (
                      <div>Max Version: {selectedTemplate.compatibility.max_version}</div>
                    )}
                    <div>Requirements: {selectedTemplate.compatibility.hardware_requirements.join(', ')}</div>
                  </div>
                </div>

                <div className="detail-section">
                  <h5>Created</h5>
                  <div>
                    <div>Date: {formatDate(selectedTemplate.created_at)}</div>
                    <div>By: {selectedTemplate.created_by}</div>
                    {selectedTemplate.updated_at !== selectedTemplate.created_at && (
                      <div>Updated: {formatDate(selectedTemplate.updated_at)}</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn-secondary"
                onClick={() => setSelectedTemplate(null)}
              >
                Close
              </button>
              <button
                className="btn-primary"
                onClick={() => {
                  applyTemplate(selectedTemplate);
                  setSelectedTemplate(null);
                }}
              >
                <i className="fas fa-play"></i>
                Apply Template
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};