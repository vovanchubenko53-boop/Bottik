# U-hub - Telegram Mini App для КНУ

### Overview
U-hub is a comprehensive Telegram Mini App designed for students of Taras Shevchenko National University of Kyiv. It offers functionalities for viewing news, managing class schedules, uploading videos, organizing student events, and a photo gallery with a "Starfall Month" contest. The project aims to enhance student life by centralizing essential university information and fostering community engagement.

### Recent Changes (October 27, 2025)
- **Complete SQLite Migration**: Successfully migrated entire application from JSON file storage to SQLite database
  - Removed all legacy JSON functions (initializeData, saveData, loadBotUsers, saveEventParticipants, etc.)
  - Replaced 106 uses of global JSON variables with async db.js functions
  - Database: uhub.db with 19 tables (bot_users, events, videos, photos, stars_balances, withdrawal_requests, etc.)
  - Retained only newsCache (for caching), bot (Telegram instance), and environment constants
- **Critical Stars Payment Bug Fixed**: Eliminated duplicate successful_payment handler that was causing double Stars credits
  - Now uses single bot.on("successful_payment") handler with correct logic
  - 1 star credited per photo unlock + 50 star bonus every 50 unlocks
  - Photo owners receive notifications when their photos are unlocked
- **Complete Admin Panel Redesign**: Modern, professional interface with enhanced functionality
  - Dark sidebar navigation with light content area
  - Dashboard section with real-time statistics (users, events, videos, photos)
  - Users section with search and filter functionality
  - Stars & Balances section with withdrawal request management
  - Enhanced moderation with large previews and quick actions
  - Responsive design with mobile burger menu
  - Toast notifications, loading states, and confirmation modals
  - All existing functions preserved and enhanced

### Previous Updates (October 24, 2025)
- **Schedule UX Enhancement**: Implemented horizontal scrolling for language groups - each time slot now displays 5 groups in an individual horizontal scroller with indicator dots
- **Blurred Photo Redesign**: Removed lock icon, added grainy animated blur effect (Telegram-style), changed text to "Відкрити за 1 ⭐", updated balance button color to #c084fc
- **Owner Notifications**: Photo owners now receive Telegram notifications when someone unlocks their blurred photos for payment
- **Withdrawal System**: Added semi-automatic withdrawal system with 50 stars minimum, admin panel for request management (approve/reject), username display, and transaction history
- **Daily Promo Modal**: Promotional modal now appears once per day (using date-based localStorage) when users open the photo gallery
- **Simplified Reactions**: Limited photo reactions to heart only (❤️), removed all other reaction types
- **Monthly Contest System**: Implemented "Місяць Зорепаду" contest system tracking top 50 photos by like count each month

### Previous Updates (October 22, 2025)
- **Photo Gallery Layout**: Changed from 2-column to 3-column grid display with square aspect-ratio images for better visual consistency
- **Album Navigation**: Added prev/next navigation buttons and touch swipe gesture support (50px threshold) for browsing album photos
- **Blur Feature Fix**: Fixed critical bug where `hasBlur` flag was lost during photo moderation - now properly preserved when approving photos
- **Upload Error Handling**: Enhanced error handling with per-file try/catch blocks, detailed logging, and user-friendly error messages
- **Chat Icon**: Added animated chat icon with wiggle animation to the news block, linking to https://t.me/u_hub_chat using Telegram Web App SDK

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
- **Data Storage**: SQLite database (`uhub.db`) with 19 tables for all data persistence, including:
  - User management (bot_users, user_stars_balances, user_restrictions, user_schedules)
  - Events (events, event_participants, event_messages, event_user_restrictions)
  - Media (videos, photos, schedules, navigation_photos)
  - Photo features (photo_reactions, photo_unlocks, photo_earnings, daily_photo_uploads, weekly_blur_photos)
  - System (admin_settings, withdrawal_requests)
- **Modularity**: Parsers are separated into dedicated modules (`newsParser.js`, `scheduleParser.js`), database layer in `db.js`.
- **Caching**: News content is cached in-memory and updated periodically to reduce load times.

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