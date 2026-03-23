# hotel-price-tracker
Chrome extension to track hotel prices across Booking.com, Hotels.com, and Expedia

# Hotel Price Tracker - Chrome Extension

A Chrome extension to track hotel prices across multiple booking sites and get notified when prices drop.

## Features

- 🔍 Search hotels by name across Booking.com, Hotels.com, and Expedia
- 💰 Track prices for specific dates and guest counts
- 📊 View price history and identify lowest prices
- 🔔 Get notifications when prices drop below your target
- ⏰ Automatic hourly price checks

## Installation

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" (top right)
4. Click "Load unpacked"
5. Select the `hotel-price-tracker` folder

## Usage

1. Click the extension icon in your Chrome toolbar
2. Fill in:
   - Hotel name (e.g., "Hilton Garden Inn")
   - Location (e.g., "San Francisco, CA")
   - Check-in and check-out dates
   - Number of adults and children
   - (Optional) Target price for alerts
3. Select which booking sites to search
4. Click "Search & Track Hotel"
5. Review results and click "Track This" on hotels you want to monitor

The extension will automatically check prices every hour and notify you when prices drop below your target.

## Files

- `manifest.json` - Extension configuration
- `background.js` - Background service worker for price checking
- `popup.html` - Extension popup interface
- `popup.js` - Popup logic and UI interactions
- `styles.css` - Popup styling

## Permissions

- `storage` - Save tracked hotels locally
- `alarms` - Schedule periodic price checks
- `notifications` - Alert when prices drop
- `tabs` & `scripting` - Access booking sites to extract prices
- `activeTab` - Interact with current page

## Technical Details

- **Manifest Version**: 3
- **Browser**: Chrome 88+
- **Search Sites**: Booking.com, Hotels.com, Expedia

## Privacy

All data is stored locally in your browser. No data is sent to external servers. The extension only accesses booking sites to search for and extract hotel prices.

## Limitations

- Booking sites may change their HTML structure, which could break price extraction
- Wait times (10 seconds per search) are needed for pages to fully load
- Some booking sites may have bot detection that could interfere with automated searches

## Future Enhancements

- Export price history to CSV
- Price trend graphs and analytics
- Support for additional booking sites
- Email notifications
- Multi-currency support

## License

MIT License - feel free to use and modify

## Disclaimer

This extension is for personal use only. Automated access to booking sites may violate their Terms of Service. Use at your own risk.
```

## Step 4: Add a .gitignore File

Create a `.gitignore` file to exclude unnecessary files:
```
# MacOS
.DS_Store

# Windows
Thumbs.db

# Editor files
.vscode/
.idea/

# Temporary files
*.log
*.tmp
