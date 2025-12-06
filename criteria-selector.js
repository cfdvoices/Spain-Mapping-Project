// Onboarding functionality
document.getElementById('startButton').addEventListener('click', () => {
  const onboardingOverlay = document.getElementById('onboardingOverlay');
  const criteriaOverlay = document.getElementById('criteriaOverlay');
  
  // Fade out onboarding
  onboardingOverlay.classList.add('hidden');
  
  // Show criteria selector after animation
  setTimeout(() => {
    onboardingOverlay.style.display = 'none';
    criteriaOverlay.style.display = 'flex';
  }, 500);
});

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
let comparisonMatrix = {};
let currentComparisonIndex = 0;
let comparisonPairs = [];

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

// Continue to pairwise comparison
document.getElementById('continueToRanking').addEventListener('click', () => {
  document.getElementById('selectionStep').style.display = 'none';
  document.getElementById('rankingStep').classList.add('active');
  initializePairwiseComparison();
});

// Back button functionality
document.getElementById('backToSelection').addEventListener('click', () => {
  goBackToSelection();
});

function goBackToSelection() {
  document.getElementById('rankingStep').classList.remove('active');
  document.getElementById('selectionStep').style.display = 'block';
  
  // Reset comparison data
  comparisonMatrix = {};
  currentComparisonIndex = 0;
  comparisonPairs = [];
  
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

// Initialize pairwise comparison process
function initializePairwiseComparison() {
  // If only one criterion, skip comparison
  if (selectedCriteria.length === 1) {
    const weights = [{
      ...selectedCriteria[0],
      weight: 100,
      rank: 1
    }];
    displayResults(weights);
    return;
  }
  
  // Generate all pairs
  comparisonPairs = [];
  for (let i = 0; i < selectedCriteria.length; i++) {
    for (let j = i + 1; j < selectedCriteria.length; j++) {
      comparisonPairs.push([selectedCriteria[i], selectedCriteria[j]]);
    }
  }
  
  // Initialize comparison matrix
  selectedCriteria.forEach(c1 => {
    comparisonMatrix[c1.id] = {};
    selectedCriteria.forEach(c2 => {
      if (c1.id === c2.id) {
        comparisonMatrix[c1.id][c2.id] = 1;
      }
    });
  });
  
  currentComparisonIndex = 0;
  document.getElementById('totalComparisons').textContent = comparisonPairs.length;
  displayCurrentComparison();
}

// Display current pairwise comparison
function displayCurrentComparison() {
  if (currentComparisonIndex >= comparisonPairs.length) {
    // All comparisons done, calculate weights
    const weights = calculateAHPWeights();
    displayResults(weights);
    return;
  }
  
  const [criterion1, criterion2] = comparisonPairs[currentComparisonIndex];
  
  // Update progress
  document.getElementById('currentComparison').textContent = currentComparisonIndex + 1;
  const progress = ((currentComparisonIndex) / comparisonPairs.length) * 100;
  document.getElementById('progressBarFill').style.width = progress + '%';
  
  const container = document.getElementById('pairwiseComparison');
  container.innerHTML = `
    <div class="comparison-question">Which criterion is more important to you?</div>
    
    <div class="criteria-comparison">
      <div class="criterion-display" id="criterion1">
        <div class="criterion-display-icon">${criterion1.icon}</div>
        <div class="criterion-display-name">${criterion1.name}</div>
      </div>
      
      <div class="vs-divider">VS</div>
      
      <div class="criterion-display" id="criterion2">
        <div class="criterion-display-icon">${criterion2.icon}</div>
        <div class="criterion-display-name">${criterion2.name}</div>
      </div>
    </div>
    
    <div class="importance-scale">
      <div class="importance-label">How much more important? (or equal)</div>
      <div class="scale-options">
        <div class="scale-option" data-value="3" data-direction="left">
          <div class="scale-value">3×</div>
          <div class="scale-label">Much more</div>
        </div>
        <div class="scale-option" data-value="2" data-direction="left">
          <div class="scale-value">2×</div>
          <div class="scale-label">More</div>
        </div>
        <div class="scale-option" data-value="1" data-direction="equal">
          <div class="scale-value">=</div>
          <div class="scale-label">Equal</div>
        </div>
        <div class="scale-option" data-value="2" data-direction="right">
          <div class="scale-value">2×</div>
          <div class="scale-label">More</div>
        </div>
        <div class="scale-option" data-value="3" data-direction="right">
          <div class="scale-value">3×</div>
          <div class="scale-label">Much more</div>
        </div>
      </div>
    </div>
    
    <div class="comparison-buttons">
      <button class="action-button" id="nextComparison" disabled>Next Comparison →</button>
    </div>
  `;
  
  // Add click handlers to scale options
  let selectedValue = null;
  let selectedDirection = null;
  
  document.querySelectorAll('.scale-option').forEach(option => {
    option.addEventListener('click', () => {
      // Remove previous selection
      document.querySelectorAll('.scale-option').forEach(opt => opt.classList.remove('selected'));
      document.querySelectorAll('.criterion-display').forEach(crit => crit.classList.remove('selected'));
      
      // Add new selection
      option.classList.add('selected');
      selectedValue = parseFloat(option.dataset.value);
      selectedDirection = option.dataset.direction;
      
      // Highlight selected criterion
      if (selectedDirection === 'left') {
        document.getElementById('criterion1').classList.add('selected');
      } else if (selectedDirection === 'right') {
        document.getElementById('criterion2').classList.add('selected');
      }
      
      // Enable next button
      document.getElementById('nextComparison').disabled = false;
    });
  });
  
  // Next button handler
  document.getElementById('nextComparison').addEventListener('click', () => {
    if (selectedValue !== null && selectedDirection !== null) {
      recordComparison(criterion1, criterion2, selectedValue, selectedDirection);
      currentComparisonIndex++;
      displayCurrentComparison();
    }
  });
}

// Record comparison in matrix
function recordComparison(criterion1, criterion2, value, direction) {
  if (direction === 'equal') {
    comparisonMatrix[criterion1.id][criterion2.id] = 1;
    comparisonMatrix[criterion2.id][criterion1.id] = 1;
  } else if (direction === 'left') {
    comparisonMatrix[criterion1.id][criterion2.id] = value;
    comparisonMatrix[criterion2.id][criterion1.id] = 1 / value;
  } else if (direction === 'right') {
    comparisonMatrix[criterion1.id][criterion2.id] = 1 / value;
    comparisonMatrix[criterion2.id][criterion1.id] = value;
  }
}

// Calculate weights using AHP (Analytic Hierarchy Process)
function calculateAHPWeights() {
  const n = selectedCriteria.length;
  const ids = selectedCriteria.map(c => c.id);
  
  // Calculate column sums
  const columnSums = {};
  ids.forEach(id => {
    columnSums[id] = 0;
    ids.forEach(compareId => {
      columnSums[id] += comparisonMatrix[compareId][id];
    });
  });
  
  // Normalize matrix and calculate average for each row (criterion weight)
  const weights = {};
  ids.forEach(id => {
    let rowSum = 0;
    ids.forEach(compareId => {
      rowSum += comparisonMatrix[id][compareId] / columnSums[compareId];
    });
    weights[id] = (rowSum / n) * 100; // Convert to percentage
  });
  
  // Create weighted criteria objects sorted by weight
  const weightedCriteria = selectedCriteria.map(criterion => ({
    ...criterion,
    weight: weights[criterion.id].toFixed(2)
  })).sort((a, b) => parseFloat(b.weight) - parseFloat(a.weight));
  
  // Add ranks
  weightedCriteria.forEach((criterion, index) => {
    criterion.rank = index + 1;
  });
  
  return weightedCriteria;
}

// Display results
function displayResults(weights) {
  document.getElementById('pairwiseComparison').style.display = 'none';
  document.getElementById('comparisonResults').style.display = 'block';
  
  // Update progress to 100%
  document.getElementById('progressBarFill').style.width = '100%';
  
  const weightsList = document.getElementById('weightsList');
  weightsList.innerHTML = '';
  
  weights.forEach(item => {
    const weightItem = document.createElement('div');
    weightItem.className = 'weight-item';
    weightItem.innerHTML = `
      <div class="weight-rank">${item.rank}</div>
      <div class="weight-icon">${item.icon}</div>
      <div class="weight-details">
        <div class="weight-name">${item.name}</div>
        <div class="weight-bar-container">
          <div class="weight-bar-fill" style="width: ${item.weight}%"></div>
        </div>
      </div>
      <div class="weight-percentage">${item.weight}%</div>
    `;
    weightsList.appendChild(weightItem);
  });
  
  // Setup explore button
  setupExploreButton(weights);
}

// Explore map
function setupExploreButton(weights) {
  const exploreBtn = document.getElementById('exploreMap');
  if (exploreBtn) {
    // Remove old listeners by cloning
    const newBtn = exploreBtn.cloneNode(true);
    exploreBtn.parentNode.replaceChild(newBtn, exploreBtn);
    
    newBtn.addEventListener('click', () => {
      const overlay = document.getElementById('criteriaOverlay');
      overlay.classList.add('hidden');
      
      setTimeout(() => {
        overlay.style.display = 'none';
        document.getElementById('mapSection').classList.add('active');
        
        // Store selected criteria for later use
        window.userCriteria = weights;
        console.log('User selected criteria:', window.userCriteria);
        
        // Initialize map (will be called from mapping-script.js)
        if (typeof initializeMap === 'function') {
          initializeMap();
        }
      }, 500);
    });
  }
}