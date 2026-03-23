console.log('Popup script loaded');

// Initialize storage and load hotels
chrome.storage.local.get(['trackedHotels'], (result) => {
  if (!result.trackedHotels) {
    console.log('Initializing trackedHotels storage');
    chrome.storage.local.set({ trackedHotels: [] }, () => {
      loadTrackedHotels();
    });
  } else {
    loadTrackedHotels();
  }
});

// Search button handler
document.getElementById('searchBtn').addEventListener('click', async () => {
  const hotelName = document.getElementById('hotelName').value.trim();
  const location = document.getElementById('location').value.trim();
  const checkin = document.getElementById('checkinDate').value;
  const checkout = document.getElementById('checkoutDate').value;
  const numAdults = parseInt(document.getElementById('numAdults').value) || 2;
  const numChildren = parseInt(document.getElementById('numChildren').value) || 0;
  const targetPrice = document.getElementById('targetPrice').value;

  if (!hotelName || !location || !checkin || !checkout) {
    alert('Please fill in hotel name, location, and dates');
    return;
  }

  const selectedSites = Array.from(document.querySelectorAll('.site-checkbox:checked'))
    .map(cb => cb.value);

  if (selectedSites.length === 0) {
    alert('Please select at least one booking site');
    return;
  }

  const searchBtn = document.getElementById('searchBtn');
  searchBtn.textContent = 'Searching...';
  searchBtn.disabled = true;

  console.log('Sending search request...');

  try {
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        action: 'searchHotel',
        data: {
          hotelName,
          location,
          checkin,
          checkout,
          numAdults,
          numChildren,
          sites: selectedSites,
          targetPrice: targetPrice ? parseFloat(targetPrice) : null
        }
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!response) {
          reject(new Error('No response from background script'));
          return;
        }
        resolve(response);
      });
    });

    console.log('Search response:', response);

    if (response.success) {
      displaySearchResults(response.results);
    } else {
      alert('Error: ' + (response.error || 'Unknown error'));
    }
  } catch (error) {
    console.error('Search error:', error);
    alert('Error: ' + error.message);
  } finally {
    searchBtn.textContent = 'Search & Track Hotel';
    searchBtn.disabled = false;
  }
});

// Display search results
function displaySearchResults(results) {
  const resultsDiv = document.getElementById('searchResults');
  const listDiv = document.getElementById('resultsList');

  resultsDiv.classList.remove('hidden');

  if (!results || results.length === 0) {
    listDiv.innerHTML = '<p class="empty-state">No results found</p>';
    return;
  }

  listDiv.innerHTML = results.map((result, index) => `
    <div class="result-item">
      <div class="result-header">
        <strong>${result.site}</strong>
        <div class="price-info">
          ${result.totalPrice 
            ? `<div class="total-price">$${result.totalPrice}</div>` 
            : '<div class="no-price">Price not found</div>'}
        </div>
      </div>
      <div class="result-details">
        <div class="hotel-name">${result.hotelName}</div>
        <div class="dates">${result.checkin} to ${result.checkout}</div>
        <div class="guests">${result.numAdults} adult(s)${result.numChildren > 0 ? `, ${result.numChildren} child(ren)` : ''}</div>
        ${result.url ? `<a href="${result.url}" target="_blank">View on ${result.site}</a>` : ''}
        ${result.error ? `<div class="error-text">Error: ${result.error}</div>` : ''}
        ${!result.found && !result.error ? '<div class="warning-text">Hotel not found</div>' : ''}
      </div>
      ${result.totalPrice ? `<button class="track-btn" data-index="${index}">Track This</button>` : ''}
    </div>
  `).join('');

  document.querySelectorAll('.track-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const index = parseInt(e.target.dataset.index);
      await addTrackedHotel(results[index]);
      alert('Hotel added to tracking!');
      loadTrackedHotels();
    });
  });
}

// Add hotel to tracking
async function addTrackedHotel(hotelData) {
  console.log('Adding hotel:', hotelData);

  const hotel = {
    id: Date.now().toString(),
    hotelName: hotelData.hotelName,
    location: hotelData.location,
    site: hotelData.site,
    url: hotelData.url,
    checkin: hotelData.checkin,
    checkout: hotelData.checkout,
    numAdults: hotelData.numAdults,
    numChildren: hotelData.numChildren,
    targetPrice: hotelData.targetPrice,
    priceHistory: hotelData.totalPrice ? [{
      basePrice: hotelData.basePrice,
      totalPrice: hotelData.totalPrice,
      timestamp: new Date().toISOString()
    }] : [],
    createdAt: new Date().toISOString()
  };

  try {
    const result = await chrome.storage.local.get(['trackedHotels']);
    const hotels = result.trackedHotels || [];
    hotels.push(hotel);
    await chrome.storage.local.set({ trackedHotels: hotels });
    console.log('Hotel saved. Total:', hotels.length);
  } catch (error) {
    console.error('Error saving hotel:', error);
    alert('Error saving hotel: ' + error.message);
  }
}

// Load tracked hotels
async function loadTrackedHotels() {
  console.log('Loading tracked hotels...');

  try {
    const result = await chrome.storage.local.get(['trackedHotels']);
    const hotels = result.trackedHotels || [];

    console.log('Loaded', hotels.length, 'hotels');

    const listDiv = document.getElementById('hotelList');

    if (!listDiv) {
      console.error('hotelList element not found');
      return;
    }

    if (hotels.length === 0) {
      listDiv.innerHTML = '<p class="empty-state">No hotels tracked yet</p>';
      return;
    }

    listDiv.innerHTML = hotels.map(hotel => {
      // Safety checks for hotel data
      if (!hotel || !hotel.hotelName) {
        console.warn('Invalid hotel data:', hotel);
        return '';
      }

      const latestPrice = hotel.priceHistory && hotel.priceHistory.length > 0
        ? hotel.priceHistory[hotel.priceHistory.length - 1]
        : null;

      const lowestTotal = hotel.priceHistory && hotel.priceHistory.length > 0
        ? Math.min(...hotel.priceHistory.map(p => p.totalPrice || 0).filter(p => p > 0))
        : null;

      return `
        <div class="hotel-item">
          <div class="hotel-header">
            <strong>${hotel.hotelName || 'Unknown Hotel'}</strong>
            <span class="site-badge">${hotel.site || 'N/A'}</span>
          </div>
          <div class="hotel-details">
            <div>${hotel.location || 'N/A'}</div>
            <div>Dates: ${hotel.checkin || 'N/A'} to ${hotel.checkout || 'N/A'}</div>
            <div>Guests: ${hotel.numAdults || 0} adult(s)${hotel.numChildren > 0 ? `, ${hotel.numChildren} child(ren)` : ''}</div>
            <div>Current: ${latestPrice && latestPrice.totalPrice ? '$' + latestPrice.totalPrice : 'N/A'}</div>
            ${lowestTotal ? `<div>Lowest: $${lowestTotal}</div>` : ''}
            ${hotel.targetPrice ? `<div>Target: $${hotel.targetPrice}</div>` : ''}
          </div>
          <div class="hotel-actions">
            <button class="view-btn" data-url="${hotel.url || '#'}">View</button>
            <button class="refresh-btn" data-id="${hotel.id || ''}">Refresh</button>
            <button class="delete-btn" data-id="${hotel.id || ''}">Delete</button>
          </div>
        </div>
      `;
    }).filter(html => html !== '').join('');

    // View button
    document.querySelectorAll('.view-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const url = e.target.dataset.url;
        if (url && url !== '#') {
          chrome.tabs.create({ url: url });
        }
      });
    });

    // Refresh button
    document.querySelectorAll('.refresh-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.target.dataset.id;
        if (!id) return;

        e.target.textContent = 'Refreshing...';
        e.target.disabled = true;

        try {
          await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ action: 'refreshHotel', hotelId: id }, (response) => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
              }
              resolve(response);
            });
          });
          loadTrackedHotels();
        } catch (error) {
          console.error('Refresh error:', error);
          alert('Error refreshing: ' + error.message);
        } finally {
          e.target.textContent = 'Refresh';
          e.target.disabled = false;
        }
      });
    });

    // Delete button
    document.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.target.dataset.id;
        if (!id) return;

        if (!confirm('Delete this tracked hotel?')) return;

        const filtered = hotels.filter(h => h.id !== id);

        await chrome.storage.local.set({ trackedHotels: filtered });
        console.log('Hotel deleted. Remaining:', filtered.length);
        loadTrackedHotels();
      });
    });

  } catch (error) {
    console.error('Error loading hotels:', error);
    const listDiv = document.getElementById('hotelList');
    if (listDiv) {
      listDiv.innerHTML = '<p class="empty-state error-text">Error loading hotels. Try refreshing.</p>';
    }
  }
}