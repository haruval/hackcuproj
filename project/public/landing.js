document.addEventListener('DOMContentLoaded', function() {
    const enterButton = document.getElementById('enter-app-button');
    
    enterButton.addEventListener('click', function() {
        // Navigate to the React app
        window.location.href = '/index.html';
    });
});