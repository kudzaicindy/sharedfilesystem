const mongoose = require('mongoose');

const sendEventSchema = new mongoose.Schema({
  type:      { type: String, enum: ['sent', 'opened', 'edited'], required: true },
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  userName:  String,
  userEmail: String,
  timestamp: { type: Date, default: Date.now },
  ipAddress: String,
}, { _id: true });

const documentSendSchema = new mongoose.Schema({
  document:       { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true },
  documentName:   { type: String, required: true },
  folder:         { type: mongoose.Schema.Types.ObjectId, ref: 'Folder', required: true },
  sender:         { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  senderName:     String,
  recipientEmail: { type: String, required: true, lowercase: true },
  recipient:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  role:           { type: String, enum: ['viewer', 'editor'], default: 'viewer' },
  status:         { type: String, enum: ['sent', 'opened', 'edited'], default: 'sent' },
  token:          { type: String, unique: true, required: true },
  events:         [sendEventSchema],
  sentAt:         { type: Date, default: Date.now },
  firstOpenedAt:  Date,
  lastOpenedAt:   Date,
  editedAt:       Date,
}, { timestamps: true });

documentSendSchema.index({ sender: 1, sentAt: -1 });
documentSendSchema.index({ recipientEmail: 1 });
documentSendSchema.index({ document: 1, recipientEmail: 1 });

module.exports = mongoose.model('DocumentSend', documentSendSchema);
