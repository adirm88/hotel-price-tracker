console.log('Hotel Price Tracker - Background script loaded');

// Set up periodic price checking
chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension installed/updated');
  // Initialize storage if needed
  chrome.storage.local.get(['trackedHotels'], (result) => {
    if (!result.trackedHotels) {
      chrome.storage.local.set({ trackedHotels: [] }, () => {
        console.log('Initialized trackedHotels storage');
      });
    }
  });
  chrome.alarms.create('checkPrices', { periodInMinutes: 60 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'checkPrices') {
    console.log('Running scheduled price check');
    checkAllHotelPrices();
  }
});

// Helper function
function getSiteName(site) {
  const names = {
    'booking': 'Booking.com',
    'hotels': 'Hotels.com',
    'expedia': 'Expedia.com'
  };
  return names[site] || site;
}

// Message listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Message received:', request.action);

  if (request.action === 'test') {
    console.log('Test message received');
    sendResponse({ success: true, message: 'Background script is working!' });
    return true;
  }

  if (request.action === 'searchHotel') {
    console.log('Search hotel request:', request.data);
    searchHotelAcrossSites(request.data)
      .then(results => {
        console.log('Search completed:', results);
        sendResponse({ success: true, results: results });
      })
      .catch(error => {
        console.error('Search error:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (request.action === 'refreshHotel') {
    console.log('Refresh hotel request:', request.hotelId);
    refreshSingleHotel(request.hotelId)
      .then(() => {
        sendResponse({ success: true });
      })
      .catch(error => {
        console.error('Refresh error:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  sendResponse({ success: false, error: 'Unknown action' });
  return false;
});

// Search hotels across sites
async function searchHotelAcrossSites(data) {
  const { hotelName, location, checkin, checkout, numAdults, numChildren, sites, targetPrice } = data;
  const results = [];

  console.log('Searching for:', hotelName, 'in', location);
  console.log('Dates:', checkin, 'to', checkout);
  console.log('Guests:', numAdults, 'adults,', numChildren, 'children');

  for (const site of sites) {
    try {
      console.log('Searching on:', site);
      const result = await searchOnSite(site, hotelName, location, checkin, checkout, numAdults, numChildren);

      if (result) {
        results.push({
          ...result,
          targetPrice,
          checkin,
          checkout,
          location,
          numAdults,
          numChildren
        });
      }
    } catch (error) {
      console.error('Error searching', site, ':', error);
      results.push({
        site: getSiteName(site),
        hotelName,
        location,
        checkin,
        checkout,
        numAdults,
        numChildren,
        error: error.message,
        found: false
      });
    }
  }

  return results;
}

// Search on a specific site
async function searchOnSite(site, hotelName, location, checkin, checkout, numAdults, numChildren) {
  const url = buildSearchUrl(site, hotelName, location, checkin, checkout, numAdults, numChildren);

  if (!url) {
    throw new Error('Could not build URL for site: ' + site);
  }

  console.log('Opening URL:', url);

  try {
    const tab = await chrome.tabs.create({ url, active: false });
    console.log('Tab created:', tab.id);

    return new Promise((resolve) => {
      setTimeout(async () => {
        try {
          console.log('Injecting extraction script into tab:', tab.id);

          const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: extractHotelData,
            args: [site, hotelName]
          });

          const result = results && results[0] ? results[0].result : null;
          console.log('Extraction result:', result);

          await chrome.tabs.remove(tab.id);

          if (result) {
            resolve(result);
          } else {
            resolve({
              site: getSiteName(site),
              hotelName,
              url,
              error: 'No data extracted',
              found: false
            });
          }
        } catch (error) {
          console.error('Script injection error:', error);
          try {
            await chrome.tabs.remove(tab.id);
          } catch (e) {
            console.error('Error removing tab:', e);
          }
          resolve({
            site: getSiteName(site),
            hotelName,
            url,
            error: 'Could not extract data: ' + error.message,
            found: false
          });
        }
      }, 10000);
    });
  } catch (error) {
    console.error('Tab creation error:', error);
    throw error;
  }
}

// Build search URL for each site
function buildSearchUrl(site, hotelName, location, checkin, checkout, numAdults, numChildren) {
  const searchQuery = encodeURIComponent(`${hotelName} ${location}`);
  const encodedLocation = encodeURIComponent(location);

  switch (site) {
    case 'booking':
      return `https://www.booking.com/searchresults.html?ss=${searchQuery}&checkin=${checkin}&checkout=${checkout}&group_adults=${numAdults}&group_children=${numChildren}&no_rooms=1`;

    case 'hotels':
      return `https://www.hotels.com/Hotel-Search?destination=${encodedLocation}&startDate=${checkin}&endDate=${checkout}&adults=${numAdults}&children=${numChildren}`;

    case 'expedia':
      return `https://www.expedia.com/Hotel-Search?destination=${encodedLocation}&startDate=${checkin}&endDate=${checkout}&adults=${numAdults}`;

    default:
      return null;
  }
}

// Extract hotel data from page (injected function)
function extractHotelData(site, hotelName) {
  console.log('=== EXTRACTION STARTING ===');
  console.log('Site:', site);
  console.log('Hotel:', hotelName);
  console.log('URL:', window.location.href);

  function getSiteName(siteCode) {
    const names = {
      'booking': 'Booking.com',
      'hotels': 'Hotels.com',
      'expedia': 'Expedia.com'
    };
    return names[siteCode] || siteCode;
  }

  function fuzzyMatch(text1, text2) {
    if (!text1 || !text2) return false;
    const normalize = (str) => str.toLowerCase().replace(/[^a-z0-9]/g, '');
    const norm1 = normalize(text1);
    const norm2 = normalize(text2);
    return norm1.includes(norm2) || norm2.includes(norm1);
  }

  function extractPrice(text) {
    if (!text) return null;
    const patterns = [
      /\$?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/,
      /(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/,
      /\$?\s*(\d+\.?\d*)/
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return parseFloat(match[1].replace(/,/g, ''));
      }
    }
    return null;
  }

  let hotelElement = null;
  let basePrice = null;
  let totalPrice = null;
  let hotelUrl = null;
  let foundHotelName = hotelName;

  try {
    if (site === 'booking') {
      console.log('Searching Booking.com...');

      const selectors = [
        '[data-testid="property-card"]',
        '[data-testid="property_card"]',
        '.sr_property_block',
        '.sr-card'
      ];

      let hotelCards = [];
      for (const selector of selectors) {
        hotelCards = document.querySelectorAll(selector);
        if (hotelCards.length > 0) {
          console.log(`Found ${hotelCards.length} cards with: ${selector}`);
          break;
        }
      }

      if (hotelCards.length === 0) {
        return {
          site: getSiteName(site),
          hotelName,
          url: window.location.href,
          error: 'No hotel cards found',
          found: false
        };
      }

      for (const card of hotelCards) {
        const titleSelectors = [
          '[data-testid="title"]',
          'h3',
          'h2',
          '.sr-hotel__name',
          'a[data-testid="title-link"]'
        ];

        let titleElement = null;
        for (const selector of titleSelectors) {
          titleElement = card.querySelector(selector);
          if (titleElement) break;
        }

        if (titleElement) {
          const cardTitle = titleElement.textContent.trim();
          console.log('Checking:', cardTitle);

          if (fuzzyMatch(cardTitle, hotelName)) {
            hotelElement = card;
            foundHotelName = cardTitle;
            console.log('✓ Match found:', foundHotelName);

            const priceSelectors = [
              '[data-testid="price-and-discounted-price"]',
              '[data-testid="price-for-x-nights"]',
              '.bui-price-display__value',
              '.prco-valign-middle-helper',
              '.sr-card__price'
            ];

            for (const selector of priceSelectors) {
              const priceElements = card.querySelectorAll(selector);
              for (const priceElement of priceElements) {
                const priceText = priceElement.textContent;
                const extracted = extractPrice(priceText);
                if (extracted && extracted > 0) {
                  totalPrice = extracted;
                  basePrice = extracted;
                  console.log('✓ Price found:', totalPrice);
                  break;
                }
              }
              if (totalPrice) break;
            }

            if (!totalPrice) {
              const allText = card.textContent;
              const priceMatches = allText.match(/\$\s*\d{1,4}(?:,\d{3})*(?:\.\d{2})?/g);
              if (priceMatches && priceMatches.length > 0) {
                const extracted = extractPrice(priceMatches[0]);
                if (extracted) {
                  totalPrice = extracted;
                  basePrice = extracted;
                  console.log('✓ Price from text:', totalPrice);
                }
              }
            }

            const linkElement = card.querySelector('a[data-testid="title-link"], a');
            if (linkElement) {
              hotelUrl = linkElement.href;
            }
            break;
          }
        }
      }

    } else if (site === 'hotels') {
      console.log('Searching Hotels.com...');
      const hotelCards = document.querySelectorAll('[data-stid="lodging-card-responsive"], [data-stid="lodging-card"]');
      console.log('Found', hotelCards.length, 'cards');

      for (const card of hotelCards) {
        const titleElement = card.querySelector('h3, h2, [data-stid="content-hotel-title"]');
        if (titleElement && fuzzyMatch(titleElement.textContent, hotelName)) {
          hotelElement = card;
          foundHotelName = titleElement.textContent.trim();
          console.log('✓ Match found:', foundHotelName);

          const priceSelectors = [
            '[data-stid="price-lockup"]',
            '[data-stid="content-hotel-lead-price"]',
            '.uitk-text-emphasis-theme',
            '.price'
          ];

          for (const selector of priceSelectors) {
            const priceElement = card.querySelector(selector);
            if (priceElement) {
              const extracted = extractPrice(priceElement.textContent);
              if (extracted) {
                totalPrice = extracted;
                basePrice = extracted;
                console.log('✓ Price found:', totalPrice);
                break;
              }
            }
          }

          const linkElement = card.querySelector('a');
          if (linkElement) {
            hotelUrl = linkElement.href;
          }
          break;
        }
      }

    } else if (site === 'expedia') {
      console.log('Searching Expedia...');
      const hotelCards = document.querySelectorAll('[data-stid="lodging-card"], [data-testid="property-card"]');
      console.log('Found', hotelCards.length, 'cards');

      for (const card of hotelCards) {
        const titleElement = card.querySelector('h3, h2, [data-stid="content-hotel-title"]');
        if (titleElement && fuzzyMatch(titleElement.textContent, hotelName)) {
          hotelElement = card;
          foundHotelName = titleElement.textContent.trim();
          console.log('✓ Match found:', foundHotelName);

          const priceSelectors = [
            '[data-stid="content-hotel-lead-price"]',
            '[data-testid="price-summary-message-line"]',
            '.uitk-price'
          ];

          for (const selector of priceSelectors) {
            const priceElement = card.querySelector(selector);
            if (priceElement) {
              const extracted = extractPrice(priceElement.textContent);
              if (extracted) {
                totalPrice = extracted;
                basePrice = extracted;
                console.log('✓ Price found:', totalPrice);
                break;
              }
            }
          }

          const linkElement = card.querySelector('a');
          if (linkElement) {
            hotelUrl = new URL(linkElement.href, window.location.origin).href;
          }
          break;
        }
      }
    }

  } catch (error) {
    console.error('Extraction error:', error);
    return {
      site: getSiteName(site),
      hotelName,
      url: window.location.href,
      error: 'Extraction failed: ' + error.message,
      found: false
    };
  }

  const result = {
    site: getSiteName(site),
    hotelName: foundHotelName,
    basePrice,
    totalPrice,
    url: hotelUrl || window.location.href,
    found: !!hotelElement
  };

  console.log('=== EXTRACTION COMPLETE ===');
  console.log('Result:', result);
  return result;
}

// Check all tracked hotels
async function checkAllHotelPrices() {
  console.log('Checking all hotel prices...');

  try {
    chrome.storage.local.get(['trackedHotels'], async (result) => {
      if (chrome.runtime.lastError) {
        console.error('Storage error:', chrome.runtime.lastError);
        return;
      }

      const hotels = result.trackedHotels || [];
      console.log('Found', hotels.length, 'tracked hotels');

      for (const hotel of hotels) {
        try {
          const priceData = await fetchHotelPrice(hotel.url, hotel.site);

          if (priceData && priceData.totalPrice) {
            hotel.priceHistory.push({
              basePrice: priceData.basePrice,
              totalPrice: priceData.totalPrice,
              timestamp: new Date().toISOString()
            });

            console.log(`${hotel.hotelName}: $${priceData.totalPrice}`);

            if (hotel.targetPrice && priceData.totalPrice <= hotel.targetPrice) {
              chrome.notifications.create({
                type: 'basic',
                title: '🏨 Hotel Price Alert!',
                message: `${hotel.hotelName} dropped to $${priceData.totalPrice} (target: $${hotel.targetPrice})`,
                iconUrl: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%230066cc" width="100" height="100"/></svg>'
              });
            }
          }
        } catch (error) {
          console.error('Error checking', hotel.hotelName, ':', error);
        }
      }

      chrome.storage.local.set({ trackedHotels: hotels }, () => {
        if (chrome.runtime.lastError) {
          console.error('Error saving hotels:', chrome.runtime.lastError);
        } else {
          console.log('Price check complete');
        }
      });
    });
  } catch (error) {
    console.error('Error in checkAllHotelPrices:', error);
  }
}

// Refresh single hotel
async function refreshSingleHotel(hotelId) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(['trackedHotels'], async (result) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
        return;
      }

      const hotels = result.trackedHotels || [];
      const hotel = hotels.find(h => h.id === hotelId);

      if (!hotel) {
        reject(new Error('Hotel not found'));
        return;
      }

      try {
        console.log('Refreshing:', hotel.hotelName);
        const priceData = await fetchHotelPrice(hotel.url, hotel.site);

        if (priceData && priceData.totalPrice) {
          hotel.priceHistory.push({
            basePrice: priceData.basePrice,
            totalPrice: priceData.totalPrice,
            timestamp: new Date().toISOString()
          });

          chrome.storage.local.set({ trackedHotels: hotels }, () => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
            } else {
              console.log('Refresh complete:', priceData.totalPrice);
              resolve();
            }
          });
        } else {
          resolve();
        }
      } catch (error) {
        reject(error);
      }
    });
  });
}

// Fetch hotel price from URL
async function fetchHotelPrice(url, site) {
  const tab = await chrome.tabs.create({ url, active: false });

  return new Promise((resolve) => {
    setTimeout(async () => {
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: extractPriceOnly,
          args: [site]
        });

        const result = results && results[0] ? results[0].result : null;
        await chrome.tabs.remove(tab.id);
        resolve(result);
      } catch (error) {
        console.error('Error fetching price:', error);
        try {
          await chrome.tabs.remove(tab.id);
        } catch (e) {}
        resolve(null);
      }
    }, 5000);
  });
}

// Extract price only (for refresh)
function extractPriceOnly(site) {
  function extractPrice(text) {
    if (!text) return null;
    const match = text.match(/\d{1,3}(?:,\d{3})*(?:\.\d{2})?/);
    return match ? parseFloat(match[0].replace(/,/g, '')) : null;
  }

  const selectors = {
    'Booking.com': [
      '[data-testid="price-and-discounted-price"]',
      '.bui-price-display__value'
    ],
    'Hotels.com': [
      '[data-stid="price-lockup"]'
    ],
    'Expedia.com': [
      '[data-stid="content-hotel-lead-price"]'
    ]
  };

  const siteSelectors = selectors[site] || [];
  let totalPrice = null;

  for (const selector of siteSelectors) {
    const element = document.querySelector(selector);
    if (element) {
      totalPrice = extractPrice(element.textContent);
      if (totalPrice) break;
    }
  }

  return {
    basePrice: totalPrice,
    totalPrice: totalPrice
  };
}

console.log('Background script ready');