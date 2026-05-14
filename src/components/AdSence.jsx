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
        <div style={{ textAlign: 'center', margin: '20px 0' }}>
            <ins className="adsbygoogle"
                 style={{ display: 'block' }}
                 data-ad-client="ca-pub-여기에_내_고유_아이디_입력"
                 data-ad-slot="여기에_광고_슬롯_아이디_입력"
                 data-ad-format="auto"
                 data-full-width-responsive="true">
            </ins>
        </div>
    );
};
