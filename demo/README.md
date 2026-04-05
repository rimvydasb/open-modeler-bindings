# Open Modeler Demo Projects

This directory contains standalone domain model prototypes that showcase the reactivity framework and execution engine of Open Modeler.

## Prerequisites

- **Node.js:** Version 24.0.0 or later is required.
- **npm:** Standard Node.js package manager.

## How to Run a Demo

Each demo is a standalone project with its own `package.json`. To run a specific demo (e.g., `credit-eligibility`), follow these steps:

1.  **Navigate to the demo directory:**
    ```bash
    cd demo/credit-eligibility
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Run the demo:**
    ```bash
    npm start
    ```

The `npm start` command uses `tsx` to execute the TypeScript code directly using Node.js.

## Running the GUI Demo

For the `loan-schedule-gui` project, the process is similar but uses the Vite development server:

1.  **Navigate to the directory:**
    ```bash
    cd demo/loan-schedule-gui
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Start the development server:**
    ```bash
    npm run dev
    ```

Then, open your browser at the URL indicated in the terminal (usually `http://localhost:5173`).
