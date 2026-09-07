const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true },
  folder:      { type: mongoose.Schema.Types.ObjectId, ref: 'Folder', required: true },
  mimeType:    { type: String },
  size:        { type: Number },
  storageKey:  { type: String },
  currentVersion: { type: mongoose.Schema.Types.ObjectId, ref: 'Version' },
  uploadedBy:  {
    user:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    name:  String,
    at:    Date,
  },
  lastModifiedBy: {
    user:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    name:  String,
    at:    Date,
  },
  isDeleted:   { type: Boolean, default: false },
  deletedAt:   { type: Date },
  localEdit: {
    user:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    userName:  String,
    startedAt: Date,
  },
}, { timestamps: true });

documentSchema.index({ folder: 1, isDeleted: 1 });

module.exports = mongoose.model('Document', documentSchema);
