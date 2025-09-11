# Planner

Tide is an intelligent productivity application that combines task management with AI to create a personalized organization experience. The application allows you to create, organize, and manage tasks through different views (Kanban, Gantt, Schedule) with the help of artificial intelligence.

## 🚀 Features

- **Intelligent Task Management**: Automatic task creation through natural language commands
- **Multiple Views**:
  - **Kanban**: Organization by status (Backlog, To-do, In Progress, Done)
  - **Gantt**: Temporal visualization of projects and tasks
  - **Schedule**: Calendar with appointments and recurring tasks
- **Integrated AI**: Uses Google Gemini AI to interpret commands and create tasks automatically
- **Drag & Drop**: Intuitive interface for reorganizing tasks
- **Task Types**:
  - **General**: Unique tasks
  - **Appointment**: Events with specific date/time
  - **Recurring**: Tasks that repeat periodically
- **Blocks/Projects System**: Task organization by context or project
- **Priorities**: Prioritization system (low, medium, high)

## 🛠️ Technologies Used

- **React 19** with TypeScript
- **Material-UI (MUI)** for interface
- **@dnd-kit** for drag & drop functionality
- **Google Gemini AI** for natural language processing
- **Axios** for HTTP requests
- **date-fns** for date manipulation
- **React Router** for navigation

## 📋 Prerequisites

- Node.js (version 16 or higher)
- npm or yarn
- Google Gemini AI API key

## 🔧 Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd tide-frontend
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variable:
Create a `.env` file in the project root and add your Gemini API key:
```env
REACT_APP_GEMINI_API_KEY=your_api_key_here
```

4. Start the development server:
```bash
npm start
```

The application will be available at [http://localhost:3000](http://localhost:3000).

## 📝 Available Scripts

### `npm start`
Runs the app in development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in the browser.

### `npm test`
Launches the test runner in interactive watch mode.

### `npm run build`
Builds the app for production to the `build` folder.\
The app is optimized for the best performance.

### `npm run eject`
**Note: This is a one-way operation!**

Removes the single build dependency from your project and copies all configuration files to your project.

## 🤖 How to Use AI

The application allows you to create tasks through natural language commands. Examples:

### Basic Commands:
- `"I need to do a report by Friday"` → Creates task with deadline
- `"I'm doing data analysis"` → Marks task as in progress
- `"I finished code review"` → Marks task as completed

### Appointments:
- `"dentist appointment tomorrow at 3pm"` → Creates appointment with time
- `"gastroenterologist on 05/09 at 2:20pm"` → Appointment with specific date

### Recurring Tasks:
- `"exercises every Tuesday at 12pm"` → Task that repeats weekly
- `"piano lesson every Wednesday at 4pm"` → Recurring appointment

### Schedule Command (for subjects):
- `"schedule computer networks every Monday 8am to 12pm"` → Creates subject block
- `"schedule mathematics every Tuesday at 2pm"` → Subject schedule

### Projects:
- `"create project 'Digital Marketing'"` → Creates new block/project
- `"in the 'Work' project I need to do a report"` → Adds task to existing project

## 🎯 Task Types

1. **General**: Unique tasks without specific date
2. **Appointment**: Unique events with defined date/time
3. **Recurring**: Tasks that repeat at regular intervals

## 📊 Views

- **Kanban**: Organize tasks by status using drag & drop
- **Gantt**: Visualize project timeline and tasks with deadlines
- **Schedule**: Manage calendar with appointments and recurring tasks

## 🔒 API Configuration

To use the AI functionality, you need a Google Gemini API key:

1. Visit [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Create a new API key
3. Add the key to the `.env` file:
```env
REACT_APP_GEMINI_API_KEY=your_api_key_here
```

## 🚀 Deployment

To deploy the application:

```bash
npm run build
```

The production files will be in the `build/` folder and can be served by any static web server.

## 📄 License

This project is under the license specified in the [LICENSE](LICENSE) file.

## 🤝 Contributing

Contributions are welcome! Feel free to open issues and pull requests.

## 📞 Support

For questions or problems, open an issue in the repository.
