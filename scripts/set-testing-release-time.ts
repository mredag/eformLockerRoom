import { promises as fs } from 'fs';
import path from 'path';

async function setTestReleaseTime() {
  const configPath = path.join(__dirname, '../config/system.json');
  const releaseTimeInSeconds = 30;
  const releaseTimeInHours = releaseTimeInSeconds / 3600;

  try {
    const configData = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(configData);

    console.log(`Current auto_release_hours: ${config.lockers.auto_release_hours}`);
    config.lockers.auto_release_hours = releaseTimeInHours;
    console.log(`New auto_release_hours: ${config.lockers.auto_release_hours}`);

    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
    console.log('Successfully set release time for testing.');
  } catch (error) {
    console.error('Error setting release time:', error);
  }
}

setTestReleaseTime();
