// models/wallet.js
const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  amount: { type: Number, required: true },
  type: { type: String, enum: ['credit', 'debit'], required: true },
  date: { type: Date, default: Date.now },
});

const walletSchema = new mongoose.Schema({
  uid: { type: String, required: true, unique: true },
  balance: { type: Number, default: 0 },
  transactions: [transactionSchema],
});

const Wallet = mongoose.model('Wallet', walletSchema);

module.exports = Wallet;
