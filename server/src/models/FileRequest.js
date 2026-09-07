const mongoose = require('mongoose');

const fileRequestSchema = new mongoose.Schema({
  token:      { type: String, required: true, unique: true, index: true },
  folder:     { type: mongoose.Schema.Types.ObjectId, ref: 'Folder', required: true },
  createdBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  label:      { type: String, trim: true },
  isActive:   { type: Boolean, default: true, index: true },
  expiresAt:  { type: Date, default: null, index: true },
  maxUploads: { type: Number, default: null },
  uploadCount:{ type: Number, default: 0 },
}, { timestamps: true });

fileRequestSchema.index({ folder: 1, isActive: 1 });

module.exports = mongoose.model('FileRequest', fileRequestSchema);

