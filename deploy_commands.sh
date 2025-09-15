# First, authenticate with Firebase
firebase login

# This will open a browser window for you to log in with your Google account
# After login, you can proceed with the other commands

# List your Firebase projects
firebase projects:list

# This will show you your available projects with their IDs

# Option 1: Deploy with specific project ID
firebase deploy --only firestore:rules --project YOUR_PROJECT_ID

# Option 2: Set active project (recommended for ongoing development)
firebase use --add
# Follow the prompts to select your project

# When prompted for alias, you can enter something simple like:
# - "default"
# - "main" 
# - "autostudioflow"
# - or just press Enter to use the project ID as alias

# After setting the alias, deploy the rules
firebase deploy --only firestore:rules