require('dotenv').config();

async function listModels() {
  console.log('Checking available Gemini models...\n');
  console.log('API Key:', process.env.GEMINI_API_KEY.substring(0, 20) + '...\n');
  
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`
    );
    
    const data = await response.json();
    
    if (data.models) {
      console.log('✅ Available models:\n');
      data.models.forEach(model => {
        console.log(`📦 ${model.name}`);
        if (model.supportedGenerationMethods) {
          console.log(`   Methods: ${model.supportedGenerationMethods.join(', ')}`);
        }
        console.log('');
      });
    } else {
      console.log('❌ Error:');
      console.log(JSON.stringify(data, null, 2));
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

listModels();