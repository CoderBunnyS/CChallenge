# FusionAuth Event Planner Application

This project is a **FusionAuth-integrated Event Planner Application** built using **Express.js** and **Pug** templates based on FusionAuth documentation. It showcases the implementation of user authentication, custom data storage, Two-Factor Authentication (2FA), and Role-Based Access Control (RBAC) using FusionAuth.

## Challenge Requirements

This application addresses the following requirements:

1. **FusionAuth Quickstart and Local Setup**:
   - A local FusionAuth instance is running on port `9011`.
   - The application is set up to authenticate users via FusionAuth.

2. **Custom User Data**:
   - Users can add additional information like nickname, favorite event, and hobby to their profile.
   - This data is stored in the `user.data` object in FusionAuth.

3. **Two-Factor Authentication (2FA)**:
   - Users can enable or disable 2FA from their profile settings.
   - If 2FA is enabled, users are prompted for a Time-Based One-Time Password (TOTP) during login.

4. **Role-Based Access Control (RBAC)**:
   - Roles like "Admin", "Editor", and "Viewer" have been implemented.
   - Access to different parts of the application is restricted based on the user's role.
   
## Features

- **FusionAuth Authentication**: Authenticate users with FusionAuth, using secure OAuth2 flow with PKCE.
- **Custom User Data**: Store additional user data (e.g., nickname, event, hobby) in FusionAuth's custom data fields.
- **Two-Factor Authentication (2FA)**: Allow users to enable/disable 2FA and require 2FA for login if enabled.
- **Role-Based Access Control**: Implement roles like Admin, Editor, and Viewer, and restrict access to certain features based on the user's role.
- **Event Management**: Authenticated users can create, view, edit, and delete events.

## Tech Stack

- **Backend**: Node.js, Express.js
- **Frontend**: Pug templates, Bootstrap
- **Authentication**: FusionAuth (OAuth2 + PKCE)
- **Authorization**: Role-based access control via FusionAuth roles
- **Two-Factor Authentication**: TOTP-based 2FA using FusionAuth

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) installed on your machine.
- [FusionAuth](https://fusionauth.io/) installed locally and running on port `9011`.


