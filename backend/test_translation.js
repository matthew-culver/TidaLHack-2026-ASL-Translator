require('dotenv').config();

async function testTranslation() {
  // Create a fake base64 image (just for testing the pipeline)
  const fakeImage = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA8A/9k=";
  
  const body = {
    imageFrame: fakeImage,
    previousFrames: [],
    sessionId: "test-session-123",
    conversationContext: []
  };
  
  console.log('🧪 Testing translation endpoint...\n');
  
  try {
    const response = await fetch('http://localhost:3001/api/translate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    
    const data = await response.json();
    
    if (data.success) {
      console.log('✅ Translation API works!');
      console.log('📊 Response:');
      console.log('   Detected Sign:', data.translation.detectedSign);
      console.log('   Confidence:', Math.round(data.translation.confidence * 100) + '%');
      console.log('   Reasoning:', data.translation.reasoning.substring(0, 100) + '...');
      console.log('\n🎉 Backend is fully operational!');
    } else {
      console.log('❌ Translation failed:', data.error);
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
}

testTranslation();