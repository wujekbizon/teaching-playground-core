import fs from 'fs';
import path from 'path';
// Path to the test-data.json file
const dataPath = path.join(process.cwd(), 'data', 'test-data.json');
const backupPath = path.join(process.cwd(), 'data', 'test-data.json.backup');
console.log('Starting room participant fix script');
console.log(`Using data file: ${dataPath}`);
// Create a backup
try {
    if (fs.existsSync(dataPath)) {
        console.log(`Creating backup at ${backupPath}`);
        fs.copyFileSync(dataPath, backupPath);
    }
    else {
        console.log(`No data file found at ${dataPath}`);
        process.exit(1);
    }
}
catch (error) {
    console.error('Error creating backup:', error);
    process.exit(1);
}
// Read the current data
let data;
try {
    console.log('Reading data file');
    const content = fs.readFileSync(dataPath, 'utf-8');
    data = JSON.parse(content);
    console.log(`Found ${data.rooms?.length || 0} rooms`);
}
catch (error) {
    console.error('Error reading data file:', error);
    process.exit(1);
}
// Ensure each room has a participants array
let modified = false;
for (const room of data.rooms) {
    console.log(`Processing room: ${room.id} - ${room.name}`);
    if (!room.participants) {
        console.log(`Adding empty participants array to room ${room.id}`);
        room.participants = [];
        modified = true;
    }
    console.log(`Room ${room.id} has ${room.participants.length} participants`);
}
// Write the updated data back to the file
if (modified) {
    try {
        console.log('Writing updated data to file');
        fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf-8');
        console.log('Data file updated successfully');
    }
    catch (error) {
        console.error('Error writing data file:', error);
        process.exit(1);
    }
}
else {
    console.log('No modifications needed');
}
console.log('Room participant fix script completed');
