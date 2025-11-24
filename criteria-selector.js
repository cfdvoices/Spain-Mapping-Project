// Criteria data with icons
const criteria = [
  { id: 'gdp', name: 'GDP per Capita', icon: '💰' },
  { id: 'population', name: 'Population Density', icon: '👥' },
  { id: 'transport', name: 'Transport Access', icon: '🚇' },
  { id: 'housing', name: 'Housing Cost', icon: '🏠' },
  { id: 'food', name: 'Food Cost', icon: '🍽️' },
  { id: 'services', name: 'Service Cost', icon: '🛍️' },
  { id: 'climate', name: 'Climate Quality', icon: '☀️' },
  { id: 'crime', name: 'Safety Level', icon: '🛡️' },
  { id: 'water', name: 'Water Quality', icon: '💧' },
  { id: 'recycling', name: 'Recycling Rate', icon: '♻️' },
  { id: 'greenspace', name: 'Green Space', icon: '🌳' },
  { id: 'hazards', name: 'Natural Safety', icon: '⛰️' },
  { id: 'education', name: 'Education Level', icon: '🎓' },
  { id: 'jobs', name: 'Job Opportunities', icon: '💼' },
  { id: 'lifeexpectancy', name: 'Life Expectancy', icon: '❤️' }
];

let selectedCriteria = [];
let draggedItem = null;

// Initialize criteria grid
const criteriaGrid = document.getElementById('criteriaGrid');
criteria.forEach(criterion => {
  const card = document.createElement('div');
  card.className = 'criterion-card';
  card.innerHTML = `
    <div class="criterion-icon">${criterion.icon}</div>
    <div class="criterion-name">${criterion.name}</div>
  `;
  
  card.addEventListener('click', () => {
    const index = selectedCriteria.findIndex(c => c.id === criterion.id);
    
    if (index > -1) {
      // Deselect
      selectedCriteria.splice(index, 1);
      card.classList.remove('selected');
      const badge = card.querySelector('.selection-badge');
      if (badge) badge.remove();
    } else {
      // Select (no limit on number of criteria)
      selectedCriteria.push(criterion);
      card.classList.add('selected');
      const badge = document.createElement('div');
      badge.className = 'selection-badge';
      badge.textContent = selectedCriteria.length;
      card.appendChild(badge);
    }
    
    // Update all badges with current order
    const allCards = Array.from(document.querySelectorAll('.criterion-card'));
    allCards.forEach(c => {
      const badge = c.querySelector('.selection-badge');
      if (badge) {
        const criterionName = c.querySelector('.criterion-name').textContent;
        const criterionData = criteria.find(cr => cr.name === criterionName);
        const orderIndex = selectedCriteria.findIndex(sc => sc.id === criterionData.id);
        if (orderIndex > -1) {
          badge.textContent = orderIndex + 1;
        }
      }
    });
    
    // Update selection counter
    updateSelectionCounter();
    
    // Enable/disable continue button (need at least 1 criterion)
    document.getElementById('continueToRanking').disabled = selectedCriteria.length === 0;
  });
  
  criteriaGrid.appendChild(card);
});

// Add selection counter after grid
function updateSelectionCounter() {
  let counter = document.querySelector('.selection-count');
  if (!counter) {
    counter = document.createElement('div');
    counter.className = 'selection-count';
    document.getElementById('selectionStep').insertBefore(
      counter,
      document.getElementById('continueToRanking')
    );
  }
  
  if (selectedCriteria.length === 0) {
    counter.textContent = 'Select at least 1 criterion to continue';
  } else if (selectedCriteria.length === 1) {
    counter.textContent = '1 criterion selected';
  } else {
    counter.textContent = `${selectedCriteria.length} criteria selected`;
  }
}

// Continue to ranking
document.getElementById('continueToRanking').addEventListener('click', () => {
  document.getElementById('selectionStep').style.display = 'none';
  document.getElementById('rankingStep').classList.add('active');
  displayRankingStepAndSetup();
  
  // Update the step indicator to show drag instruction
  document.querySelector('#rankingStep .step-indicator').textContent = 
    `Step 2: Drag to reorder by importance (${selectedCriteria.length} ${selectedCriteria.length === 1 ? 'criterion' : 'criteria'} selected)`;
});

// Back button functionality
document.getElementById('backToSelection').addEventListener('click', () => {
  goBackToSelection();
});

function goBackToSelection() {
  document.getElementById('rankingStep').classList.remove('active');
  document.getElementById('selectionStep').style.display = 'block';
  
  // Update the visual state of selected cards
  const allCards = Array.from(document.querySelectorAll('.criterion-card'));
  allCards.forEach(card => {
    const criterionName = card.querySelector('.criterion-name').textContent;
    const criterionData = criteria.find(cr => cr.name === criterionName);
    const isSelected = selectedCriteria.some(sc => sc.id === criterionData.id);
    
    if (isSelected) {
      if (!card.classList.contains('selected')) {
        card.classList.add('selected');
      }
      // Update badge
      const orderIndex = selectedCriteria.findIndex(sc => sc.id === criterionData.id);
      let badge = card.querySelector('.selection-badge');
      if (!badge) {
        badge = document.createElement('div');
        badge.className = 'selection-badge';
        card.appendChild(badge);
      }
      badge.textContent = orderIndex + 1;
    } else {
      card.classList.remove('selected');
      const badge = card.querySelector('.selection-badge');
      if (badge) badge.remove();
    }
  });
  
  // Update selection counter and button state
  updateSelectionCounter();
  document.getElementById('continueToRanking').disabled = selectedCriteria.length === 0;
}

// Calculate weights using exponential decay that works for any number of criteria
function calculateWeights() {
  const n = selectedCriteria.length;
  if (n === 0) return [];
  
  const weights = [];
  let totalWeight = 0;
  
  // Calculate exponential weights: first gets 2^(n-1), second gets 2^(n-2), etc.
  // This creates a decay pattern where earlier ranks are significantly more important
  for (let i = 0; i < n; i++) {
    const weight = Math.pow(2, n - 1 - i);
    totalWeight += weight;
  }
  
  // Normalize to percentages
  selectedCriteria.forEach((criterion, i) => {
    const rawWeight = Math.pow(2, n - 1 - i);
    const normalizedWeight = (rawWeight / totalWeight) * 100;
    weights.push({
      ...criterion,
      rank: i + 1,
      weight: normalizedWeight.toFixed(2),
      rawWeight: rawWeight
    });
  });
  
  return weights;
}

// Display ranking step with drag-and-drop functionality
function displayRankingStep() {
  const rankingList = document.getElementById('rankingList');
  rankingList.innerHTML = '';
  
  const weights = calculateWeights();
  
  weights.forEach((item, index) => {
    const rankingItem = document.createElement('div');
    rankingItem.className = 'ranking-item';
    rankingItem.draggable = true;
    rankingItem.dataset.index = index;
    rankingItem.dataset.id = item.id;
    
    rankingItem.innerHTML = `
      <div class="drag-handle">⋮⋮</div>
      <div class="ranking-number">${item.rank}</div>
      <div class="ranking-icon">${item.icon}</div>
      <div class="ranking-details">
        <div class="ranking-name">${item.name}</div>
        <div class="ranking-weight">Weight: ${item.weight}%</div>
      </div>
      <button class="delete-btn" title="Remove criterion">×</button>
    `;
    
    // Add delete button listener
    const deleteBtn = rankingItem.querySelector('.delete-btn');
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeCriterion(item.id);
    });
    
    // Add drag event listeners
    rankingItem.addEventListener('dragstart', handleDragStart);
    rankingItem.addEventListener('dragover', handleDragOver);
    rankingItem.addEventListener('drop', handleDrop);
    rankingItem.addEventListener('dragend', handleDragEnd);
    
    rankingList.appendChild(rankingItem);
  });
}

// Remove a criterion from the selection
function removeCriterion(criterionId) {
  const index = selectedCriteria.findIndex(c => c.id === criterionId);
  if (index > -1) {
    selectedCriteria.splice(index, 1);
    
    // If no criteria left, go back to selection step
    if (selectedCriteria.length === 0) {
      goBackToSelection();
    } else {
      // Refresh the ranking display
      displayRankingStep();
      document.querySelector('#rankingStep .step-indicator').textContent = 
        `Step 2: Drag to reorder by importance (${selectedCriteria.length} ${selectedCriteria.length === 1 ? 'criterion' : 'criteria'} selected)`;
    }
  }
}

// Drag and drop handlers
function handleDragStart(e) {
  draggedItem = this;
  this.style.opacity = '0.4';
  e.dataTransfer.effectAllowed = 'move';
}

function handleDragOver(e) {
  if (e.preventDefault) {
    e.preventDefault();
  }
  e.dataTransfer.dropEffect = 'move';
  
  const targetItem = e.currentTarget;
  if (draggedItem !== targetItem) {
    targetItem.style.borderTop = '3px solid #667eea';
  }
  return false;
}

function handleDrop(e) {
  if (e.stopPropagation) {
    e.stopPropagation();
  }
  
  const targetItem = e.currentTarget;
  targetItem.style.borderTop = '';
  
  if (draggedItem !== targetItem) {
    // Reorder the selectedCriteria array
    const draggedId = draggedItem.dataset.id;
    const targetId = targetItem.dataset.id;
    
    const draggedIndex = selectedCriteria.findIndex(c => c.id === draggedId);
    const targetIndex = selectedCriteria.findIndex(c => c.id === targetId);
    
    // Remove dragged item and insert at new position
    const [removed] = selectedCriteria.splice(draggedIndex, 1);
    selectedCriteria.splice(targetIndex, 0, removed);
    
    // Refresh the display
    displayRankingStep();
  }
  
  return false;
}

function handleDragEnd(e) {
  this.style.opacity = '1';
  
  // Remove all border highlights
  document.querySelectorAll('.ranking-item').forEach(item => {
    item.style.borderTop = '';
  });
}

// Explore map
function setupExploreButton() {
  const exploreBtn = document.getElementById('exploreMap');
  if (exploreBtn) {
    exploreBtn.addEventListener('click', () => {
      const overlay = document.getElementById('criteriaOverlay');
      overlay.classList.add('hidden');
      
      setTimeout(() => {
        overlay.style.display = 'none';
        document.getElementById('mapSection').classList.add('active');
        
        // Store selected criteria for later use
        window.userCriteria = calculateWeights();
        console.log('User selected criteria:', window.userCriteria);
        
        // Initialize map (will be called from mapping-script.js)
        if (typeof initializeMap === 'function') {
          initializeMap();
        }
      }, 500);
    });
  }
}

// Call setup when ranking step is displayed
function displayRankingStepAndSetup() {
  displayRankingStep();
  // Small delay to ensure button is in DOM
  setTimeout(setupExploreButton, 0);
}