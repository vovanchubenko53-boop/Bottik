# U-hub - Telegram Mini App для КНУ

### Overview
U-hub is a comprehensive Telegram Mini App designed for students of Taras Shevchenko National University of Kyiv. It offers functionalities for viewing news, managing class schedules, uploading videos, organizing student events, and a photo gallery with a "Starfall Month" contest. The project aims to enhance student life by centralizing essential university information and fostering community engagement.

### User Preferences
I want to ensure that the project is developed with maintainability and scalability in mind. I prefer clear, concise code and well-documented architectural decisions. For communication, please provide detailed explanations of proposed changes or complex implementations before proceeding. I am open to iterative development and prefer to review major feature implementations or architectural shifts. I prioritize robust error handling and user experience, so please focus on these aspects during development.

### System Architecture

#### UI/UX Decisions
The application utilizes HTML5, Vanilla JavaScript, and Tailwind CSS for styling, ensuring a modern and responsive user interface. Lucide Icons are used for iconography, and the Telegram Web App SDK provides seamless integration with Telegram's ecosystem. Animations include smooth transitions, hover effects, ripple effects on buttons, and staggered fadeInUp animations for cards to enhance user experience. A skeleton loader is implemented for images to improve perceived loading performance.

#### Technical Implementations
The backend is built with Node.js 20 and Express.js. Key functionalities include:
- **News Parsing**: Automatic parsing of news from official university websites and Telegram channels using Cheerio and Axios, with a caching mechanism for quick access.
- **Schedule Management**: Parsing of Excel schedule files using ExcelJS.
- **Event System**: Creation, joining, and management of events with integrated mini-chat functionality, participant tracking via Telegram User ID, and automatic event completion.
- **Video & Photo Uploads**: Multer is used for file uploads, with a moderation system for videos that integrates with a Telegram Bot for approval/rejection.
- **Admin Panel**: A password-protected interface (`/admin`) for managing hero images, broadcasting messages to users, and moderating uploaded content.
- **Telegram Bot Integration**: `node-telegram-bot-api` is used to handle user interactions, send notifications, and facilitate video moderation through inline keyboard buttons.

#### Feature Specifications
- **News**: Aggregated news feed from multiple sources with full article viewing and sharing capabilities.
- **Schedules**: Searchable schedules by specialty code or name, filtered by course, with weekly views and "My Schedule" persistence (localStorage).
- **Video**: User-uploaded videos with moderation, potential TikTok integration, and user notifications.
- **Events**: User-created events with joining/leaving functionality, integrated chat, photo gallery, and participant tracking.
- **"Starfall Month" Contest**: Photo contest with blur option, Telegram Stars payouts for views, single like reaction, and author attribution.
- **Admin Panel**: Centralized control for content moderation, image management, and mass communication.

#### System Design Choices
- **Frontend**: Single-page application approach using `index.html` for all main views and `app.js` for logic.
- **Backend**: RESTful API design using Express.js.
- **Data Storage**: JSON files (`events.json`, `videos.json`, `photos.json`, `botUsers.json`, `adminSettings.json`) are used for data persistence.
- **Modularity**: Parsers are separated into dedicated modules (`newsParser.js`, `scheduleParser.js`).
- **Caching**: News content is cached and updated periodically to reduce load times.

### External Dependencies

- **Telegram Web App SDK**: For seamless integration with the Telegram Mini App environment.
- **Node.js 20**: Runtime environment for the backend.
- **Express.js**: Web application framework for the backend.
- **Cheerio**: Used for parsing HTML content from news sources.
- **Axios**: HTTP client for making API requests, particularly for news parsing.
- **ExcelJS**: For parsing and processing Excel files, specifically for academic schedules.
- **Multer**: Middleware for handling `multipart/form-data`, primarily for file uploads (videos and photos).
- **node-telegram-bot-api**: Official library for interacting with the Telegram Bot API.
- **Tailwind CSS**: Utility-first CSS framework for styling.
- **Lucide Icons**: Icon library for the user interface.
- **TikTok API (potential future integration)**: For publishing approved videos.
- **PostgreSQL (future consideration)**: For robust database management.