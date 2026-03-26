import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    // Validate AppScript URL
    const appscriptUrl = process.env.NEXT_PUBLIC_APPSCRIPT_URL;
    if (!appscriptUrl || appscriptUrl.includes('GANTI_DENGAN_ID_DEPLOYMENT_ANDA')) {
      return NextResponse.json(
        { status: 'error', message: 'Variabel NEXT_PUBLIC_APPSCRIPT_URL belum disetting dengan benar di server (.env.local).' },
        { status: 500 }
      );
    }

    // Call Google AppScript Web App
    const res = await fetch(appscriptUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      // Automatically follow the 302 redirect from Google Scripts
      redirect: 'follow'
    });

    const data = await res.json();
    return NextResponse.json(data);
    
  } catch (error: any) {
    console.error('Error proxying to AppScript:', error);
    return NextResponse.json(
      { status: 'error', message: 'Terjadi kesalahan saat menghubungi server Google AppScript: ' + error.message },
      { status: 500 }
    );
  }
}
