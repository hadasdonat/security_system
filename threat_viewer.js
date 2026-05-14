document.addEventListener('DOMContentLoaded', () => {
    const threatList = document.getElementById('threat-list');
    const videoPlayer = document.getElementById('threat-video');
    
    let currentData = [];
    
    function fetchThreats() {
        fetch('threat_videos_db.json?_=' + new Date().getTime())
            .then(res => {
                if (!res.ok) return [];
                return res.json();
            })
            .then(data => {
                if (JSON.stringify(data) !== JSON.stringify(currentData)) {
                    currentData = data;
                    renderList();
                }
            })
            .catch(err => console.log("No DB yet or fetch error", err));
    }
    
    function renderList() {
        threatList.innerHTML = '';
        if (currentData.length === 0) {
            threatList.innerHTML = '<li style="text-align:center;color:#666;">No recorded threats... waiting.</li>';
            return;
        }
        
        currentData.forEach(item => {
            const li = document.createElement('li');
            li.textContent = item.title;
            li.dataset.url = item.url;
            li.addEventListener('click', () => {
                // Remove active class from all
                document.querySelectorAll('#threat-list li').forEach(n => n.classList.remove('active'));
                li.classList.add('active');
                
                // Play video by fetching it as a Blob first. This completely bypasses the Python server's
                // inability to handle byte-range seeking, allowing our fast-forward hack to work locally!
                videoPlayer.classList.remove('active');
                
                fetch(item.url)
                    .then(r => r.blob())
                    .then(blob => {
                        const localUrl = URL.createObjectURL(blob);
                        videoPlayer.src = localUrl;
                        videoPlayer.classList.add('active');
                        
                        // Hack to force the browser to instantly calculate the full duration 
                        videoPlayer.onloadedmetadata = () => {
                            if (videoPlayer.duration === Infinity || isNaN(videoPlayer.duration) || videoPlayer.duration < 2) {
                                videoPlayer.currentTime = 1e101;
                                videoPlayer.ontimeupdate = () => {
                                    videoPlayer.ontimeupdate = null;
                                    videoPlayer.currentTime = 0;
                                    videoPlayer.play();
                                };
                            } else {
                                videoPlayer.play();
                            }
                        };
                    })
                    .catch(e => console.error("Video load error:", e));
            });
            threatList.appendChild(li);
        });
    }

    // Initial fetch and poll
    fetchThreats();
    setInterval(fetchThreats, 3000);
});
