import React, { useEffect } from 'react';

export const AdSense = () => {
    useEffect(() => {
        try {
            (window.adsbygoogle = window.adsbygoogle || []).push({});
        } catch (error) {
            console.error("광고 로드 에러:", error);
        }
    }, []);

    return (
        <div style={{ textAlign: 'center', margin: '20px 0', background: '#fff' }}>
            <ins className="adsbygoogle"
                 style={{ display: 'block' }}
                 data-ad-client="ca-pub-1494698073875494"
                 data-ad-slot="6344413074"
                 data-ad-format="auto"
                 data-full-width-responsive="true">
            </ins>
        </div>
    );
};
