// controllers/walletController.js
const Wallet = require('../models/wallet');
const User = require('../models/user');

const getWallet = async (req, res) => {
  const { uid } = req.params;
  try {
    const wallet = await Wallet.findOne({ uid });
    if (!wallet) {
      return res.status(404).json({ message: 'Wallet not found' });
    }
    res.json(wallet);
  } catch (error) {
    console.error('Error fetching wallet:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

const addBalance = async (req, res) => {
  const { uid, amount } = req.body;
  try {
    let wallet = await Wallet.findOne({ uid });
    if (!wallet) {
      wallet = new Wallet({ uid, balance: 0, transactions: [] });
    }
    wallet.balance += amount;
    wallet.transactions.push({ amount, type: 'credit' });
    await wallet.save();
    res.json(wallet);
  } catch (error) {
    console.error('Error adding balance:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

const withdrawBalance = async (req, res) => {
  const { uid, amount } = req.body;
  try {
    const wallet = await Wallet.findOne({ uid });
    if (!wallet) {
      return res.status(404).json({ message: 'Wallet not found' });
    }
    if (wallet.balance < amount) {
      return res.status(400).json({ message: 'Insufficient balance' });
    }
    wallet.balance -= amount;
    wallet.transactions.push({ amount, type: 'debit' });
    await wallet.save();
    res.json(wallet);
  } catch (error) {
    console.error('Error withdrawing balance:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  getWallet,
  addBalance,
  withdrawBalance,
};
