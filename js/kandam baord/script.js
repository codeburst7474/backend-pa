document.addEventListener('DOMContentLoaded', () => {
    const taskInput = document.getElementById('task-input');
    const addTaskBtn = document.getElementById('add-task-btn');
    const todoList = document.getElementById('todo-list');
    const taskLists = document.querySelectorAll('.task-list');

    // Add Task Events
    addTaskBtn.addEventListener('click', addTask);
    
    // Also allow adding task by pressing Enter key
    taskInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            addTask();
        }
    });

    // Function to handle adding a new task
    function addTask() {
        const taskText = taskInput.value.trim();
        if (taskText === '') return; // Don't add empty tasks

        const taskCard = createTaskElement(taskText);
        todoList.appendChild(taskCard);
        
        // Clear input after adding
        taskInput.value = '';
        updateTaskCounts();
    }

    // Function to create a task DOM element
    function createTaskElement(text) {
        const card = document.createElement('div');
        card.classList.add('task-card');
        card.setAttribute('draggable', 'true'); // Make element draggable

        const content = document.createElement('div');
        content.classList.add('task-content');
        content.textContent = text;

        const deleteBtn = document.createElement('button');
        deleteBtn.classList.add('delete-btn');
        deleteBtn.innerHTML = '&times;'; // HTML entity for 'x'
        deleteBtn.setAttribute('title', 'Delete task');
        deleteBtn.addEventListener('click', () => {
            card.remove(); // Remove task when clicked
            updateTaskCounts();
        });

        card.appendChild(content);
        card.appendChild(deleteBtn);

        // --- Drag and Drop Events for the Card ---
        
        card.addEventListener('dragstart', () => {
            // Add a slight delay so the original element doesn't disappear immediately while dragging
            setTimeout(() => card.classList.add('is-dragging'), 0);
        });

        card.addEventListener('dragend', () => {
            card.classList.remove('is-dragging');
            updateTaskCounts();
        });

        return card;
    }

    // --- Drag and Drop functionality for the Dropzones (Lists) ---
    
    taskLists.forEach(list => {
        // Necessary to allow dropping
        list.addEventListener('dragover', e => {
            e.preventDefault(); 
            list.classList.add('drag-over'); // Optional visual cue
            
            const draggable = document.querySelector('.is-dragging');
            if (!draggable) return;

            // Calculate where exactly to drop the item relative to others
            const afterElement = getDragAfterElement(list, e.clientY);
            
            if (afterElement == null) {
                list.appendChild(draggable);
            } else {
                list.insertBefore(draggable, afterElement);
            }
        });

        // Remove visual cue when leaving the dropzone
        list.addEventListener('dragleave', () => {
            list.classList.remove('drag-over');
        });

        // Handle the drop event
        list.addEventListener('drop', e => {
            e.preventDefault();
            list.classList.remove('drag-over');
            updateTaskCounts();
        });
    });

    // Helper function to determine where the task should be placed during drag
    // This allows dropping tasks *between* other tasks
    function getDragAfterElement(container, y) {
        // Get all task cards in the container except the one currently being dragged
        const draggableElements = [...container.querySelectorAll('.task-card:not(.is-dragging)')];

        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            // Calculate distance between mouse Y and the middle of the child box
            const offset = y - box.top - box.height / 2;
            
            // If the mouse is above the middle of the box
            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    // Update the counter at the top of each column
    function updateTaskCounts() {
        document.querySelectorAll('.column').forEach(column => {
            const list = column.querySelector('.task-list');
            const count = list.querySelectorAll('.task-card').length;
            column.querySelector('.task-count').textContent = count;
        });
    }

    // Add a couple of initial dummy tasks for demonstration
    function initializeDemo() {
        taskInput.value = "Design new landing page";
        addTask();
        taskInput.value = "Review pull requests";
        addTask();
        
        // Move one to "In Progress"
        setTimeout(() => {
            const firstTask = document.querySelector('.task-card');
            if(firstTask) {
                document.getElementById('in-progress-list').appendChild(firstTask);
                updateTaskCounts();
            }
        }, 100);
    }

    initializeDemo();
});