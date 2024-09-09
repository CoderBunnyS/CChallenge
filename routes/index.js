const express = require('express');
const router = express.Router();
const { FusionAuthClient } = require('@fusionauth/typescript-client');
const pkceChallenge = require('pkce-challenge');

const fs = require('fs');
const path = require('path');

// Define the path to the events.json file
const filePath = path.join(__dirname, '../data/events.json');

// Function to read events from the JSON file
function readEventsFromFile() {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data || '[]'); // Return empty array if file is empty
  } catch (err) {
    console.error('Error reading events from file:', err);
    return [];
  }
}

// Function to write events to the JSON file
function writeEventsToFile(events) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(events, null, 2), 'utf8');
  } catch (err) {
    console.error('Error writing events to file:', err);
  }
}

// Set environment variables
const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;
const fusionAuthURL = process.env.BASE_URL;

const client = new FusionAuthClient('noapikeyneeded', fusionAuthURL);

// Logout Route
router.get('/logout', function (req, res, next) {
  req.session.destroy();
  res.redirect(302, '/');
});

// Home Page Route
router.get('/', function (req, res, next) {
  const stateValue = Math.random().toString(36).substring(2, 15) +
                     Math.random().toString(36).substring(2, 15);
  req.session.stateValue = stateValue;

  const pkce_pair = pkceChallenge.default();
  req.session.verifier = pkce_pair['code_verifier'];
  const challenge = pkce_pair['code_challenge'];

  const events = readEventsFromFile(); // Read events from the JSON file

  res.render('index', {
    user: req.session.user,
    title: 'Event Planner',
    clientId: clientId,
    challenge: challenge,
    stateValue: stateValue,
    fusionAuthURL: fusionAuthURL,
    events: events // Pass events to the home page
  });
});

// New Route: Login with Redirect
router.get('/login-with-redirect', (req, res) => {
  const redirectUri = req.query.redirect_uri;

  // Store the intended redirect URI in the session
  req.session.redirectUri = redirectUri;

  // Generate the PKCE challenge and state value
  const stateValue = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  const pkcePair = pkceChallenge.default();
  const codeChallenge = pkcePair.code_challenge;
  const codeVerifier = pkcePair.code_verifier;

  // Store state and verifier in the session
  req.session.stateValue = stateValue;
  req.session.verifier = codeVerifier;

  // Redirect to FusionAuth's OAuth login page
  res.redirect(`${fusionAuthURL}/oauth2/authorize?client_id=${clientId}&response_type=code&redirect_uri=http://localhost:3000/oauth-redirect&scope=offline_access&state=${stateValue}&code_challenge=${codeChallenge}&code_challenge_method=S256`);
});

// OAuth Redirect Route
router.get('/oauth-redirect', function (req, res, next) {
  const stateFromServer = req.query.state;
  if (stateFromServer !== req.session.stateValue) {
    console.log("State doesn't match. uh-oh.");
    res.redirect(302, '/');
    return;
  }

  client.exchangeOAuthCodeForAccessTokenUsingPKCE(req.query.code, clientId, clientSecret, 'http://localhost:3000/oauth-redirect', req.session.verifier)
    .then((response) => {
      return client.retrieveUserUsingJWT(response.response.access_token);
    })
    .then((response) => {
      req.session.user = response.response.user;

      // Retrieve the stored redirect URI from the session, or default to home page
      const redirectUri = req.session.redirectUri || '/';

      // Clear the session variable after use
      req.session.redirectUri = null;

      res.redirect(302, redirectUri); // Redirect to the custom URI or home page
    })
    .catch((err) => {
      console.error("Error during OAuth:", JSON.stringify(err));
      res.redirect(302, '/');
    });
});

// Create Event Page (GET)
router.get('/create-event', (req, res) => {
  if (!req.session.user) {
    return res.redirect('/'); // Redirect if not logged in
  }

  res.render('create-event', {
    title: 'Create New Event',
    user: req.session.user
  });
});

// Create Event (POST)
router.post('/create-event', (req, res) => {
  const { name, date, location } = req.body;

  if (!name || !date || !location) {
    return res.status(400).send('All fields are required');
  }

  const events = readEventsFromFile(); // Read existing events from the file

  const newEvent = {
    id: events.length > 0 ? events[events.length - 1].id + 1 : 1, // Generate a new ID
    name,
    date,
    location
  };

  events.push(newEvent); // Add the new event to the array

  writeEventsToFile(events); // Write the updated array back to the file

  console.log('Event created:', newEvent);
  res.redirect('/'); // Redirect back to the home page after saving
});

// Event Details Page (GET)
router.get('/events/:id', (req, res) => {
  const eventId = parseInt(req.params.id);
  const events = readEventsFromFile(); // Read events from the file
  const event = events.find(e => e.id === eventId);

  if (!event) {
    return res.status(404).send('Event not found');
  }

  // Generate PKCE challenge and stateValue
  const stateValue = Math.random().toString(36).substring(2, 15) + 
                     Math.random().toString(36).substring(2, 15);
  const pkcePair = pkceChallenge.default();
  const codeVerifier = pkcePair.code_verifier;
  const codeChallenge = pkcePair.code_challenge;

  // Pass FusionAuth details and the event data to the template
  res.render('event-details', {
    title: `Event: ${event.name}`,
    event: event,
    user: req.session.user,
    clientId: process.env.CLIENT_ID, // Use your FusionAuth client ID from env
    stateValue: stateValue,
    challenge: codeChallenge,
    fusionAuthURL: process.env.BASE_URL // Base URL for FusionAuth
  });
});

// Edit Event Page (GET)
router.get('/events/:id/edit', (req, res) => {
  if (!req.session.user) {
    return res.redirect('/'); // Redirect if not logged in
  }

  const eventId = parseInt(req.params.id);

  const events = readEventsFromFile(); // Read events from the file
  const event = events.find(e => e.id === eventId);

  if (!event) {
    return res.status(404).send('Event not found');
  }

  res.render('edit-event', {
    title: `Edit Event: ${event.name}`,
    event: event,
    user: req.session.user
  });
});

// Update Event (POST)
router.post('/events/:id/edit', (req, res) => {
  if (!req.session.user) {
    return res.redirect('/'); // Redirect if not logged in
  }

  const eventId = parseInt(req.params.id);
  const { name, date, location } = req.body;

  const events = readEventsFromFile(); // Read events from the file
  const eventIndex = events.findIndex(e => e.id === eventId);

  if (eventIndex === -1) {
    return res.status(404).send('Event not found');
  }

  // Update the event
  events[eventIndex].name = name;
  events[eventIndex].date = date;
  events[eventIndex].location = location;

  writeEventsToFile(events); // Write the updated events back to the file

  res.redirect(`/events/${eventId}`); // Redirect to the updated event details page
});

// Delete Event (POST)
router.post('/events/:id/delete', (req, res) => {
  if (!req.session.user) {
    return res.redirect('/'); // Redirect if not logged in
  }

  const eventId = parseInt(req.params.id);

  let events = readEventsFromFile(); // Read events from the file

  const eventIndex = events.findIndex(e => e.id === eventId);

  if (eventIndex === -1) {
    return res.status(404).send('Event not found');
  }

  events.splice(eventIndex, 1); // Remove the event from the array

  writeEventsToFile(events); // Write the updated events back to the file

  res.redirect('/'); // Redirect to the home page after deleting the event
});

module.exports = router;
