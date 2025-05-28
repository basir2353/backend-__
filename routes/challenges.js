const express = require('express');
const router = express.Router();
const Challenge = require('../models/challenges');

// Create Challenge
router.post('/createChallenge', async (req, res) => {
  try {
    const { title, description, rewardPoints } = req.body;
    if (!title || !description || typeof rewardPoints !== 'number') {
      return res.status(400).json({ message: 'Title, description, and rewardPoints are required.' });
    }
    const challenge = new Challenge({ 
      title, 
      description, 
      rewardPoints,
      participantsCount: 0,
      participants: []
    });
    await challenge.save();
    res.status(201).json({ message: 'Challenge created successfully', challenge });
  } catch (error) {
    res.status(500).json({ message: 'Failed to create challenge', error: error.message });
  }
});

// Get All Challenges
router.get('/challenges', async (req, res) => {
  try {
    const challenges = await Challenge.find();
    res.status(200).json({ challenges });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch challenges', error: error.message });
  }
});

// Participate in Challenge
router.post('/participate/:challengeId', async (req, res) => {
  try {
    const { challengeId } = req.params;
    const { participantId } = req.body;

    if (!participantId) {
      return res.status(400).json({ message: 'Participant ID is required' });
    }

    const challenge = await Challenge.findById(challengeId);
    if (!challenge) {
      return res.status(404).json({ message: 'Challenge not found' });
    }

    // Ensure no duplicate participation
    if (challenge.participants.includes(participantId)) {
      return res.status(400).json({ message: 'You have already participated in this challenge' });
    }

    challenge.participants.push(participantId);
    challenge.participantsCount = challenge.participants.length;
    await challenge.save();

    res.status(200).json({
      message: 'Successfully participated in challenge',
      challenge,
      participantsCount: challenge.participantsCount
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to participate in challenge', error: error.message });
  }
});

module.exports = router;
