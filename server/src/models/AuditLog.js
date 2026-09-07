const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  userId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  userName:     { type: String, required: true },
  userEmail:    { type: String, required: true },
  action:       {
    type: String,
    enum: ['uploaded', 'edited', 'revision', 'opened', 'deleted', 'restored', 'shared', 'unshared', 'moved', 'renamed', 'downloaded'],
    required: true,
  },
  resourceType: { type: String, enum: ['document', 'folder'], required: true },
  resourceId:   { type: mongoose.Schema.Types.ObjectId, required: true },
  resourceName: { type: String },
  folderId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Folder' },
  versionId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Version' },
  ipAddress:    { type: String },
  metadata:     { type: mongoose.Schema.Types.Mixed },
  timestamp:    { type: Date, default: Date.now, index: true },
}, { timestamps: false, versionKey: false });

auditLogSchema.index({ resourceId: 1, timestamp: -1 });
auditLogSchema.index({ userId: 1, timestamp: -1 });
auditLogSchema.index({ folderId: 1, timestamp: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
