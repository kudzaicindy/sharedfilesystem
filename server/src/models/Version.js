const mongoose = require('mongoose');

const versionSchema = new mongoose.Schema({
  document:   { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true },
  versionNum: { type: Number, required: true },
  storageKey: { type: String, required: true },
  size:       { type: Number },
  createdBy:  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    name: String,
  },
  comment:    { type: String },
  /** OnlyOffice changes.zip for in-editor version diff (optional). */
  changesStorageKey: { type: String },
  onlyOfficeServerVersion: { type: String },
}, { timestamps: true });

versionSchema.index({ document: 1, versionNum: -1 });

module.exports = mongoose.model('Version', versionSchema);
