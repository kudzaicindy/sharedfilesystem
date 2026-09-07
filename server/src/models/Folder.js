const mongoose = require('mongoose');

const memberSchema = new mongoose.Schema({
  user:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  role:  { type: String, enum: ['owner', 'editor', 'viewer'], default: 'viewer' },
}, { _id: false });

const pendingInviteSchema = new mongoose.Schema({
  email:     { type: String, required: true, lowercase: true, trim: true },
  role:      { type: String, enum: ['editor', 'viewer'], default: 'viewer' },
  token:     { type: String },
  invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  invitedAt: { type: Date, default: Date.now },
  emailSentAt: { type: Date },
}, { _id: false });

const folderSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true },
  parent:      { type: mongoose.Schema.Types.ObjectId, ref: 'Folder', default: null },
  owner:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  members:     [memberSchema],
  pendingInvites: [pendingInviteSchema],
  isRoot:      { type: Boolean, default: false },
  color:       { type: String, default: '#6366f1' },
  description: { type: String },
  isDeleted:   { type: Boolean, default: false },
  deletedAt:   { type: Date },
}, { timestamps: true });

folderSchema.index({ parent: 1, owner: 1 });
folderSchema.index({ isDeleted: 1, owner: 1 });
folderSchema.index({ 'pendingInvites.email': 1 });
folderSchema.index({ 'pendingInvites.token': 1 });

module.exports = mongoose.model('Folder', folderSchema);
